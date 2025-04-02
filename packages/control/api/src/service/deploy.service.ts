import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as unzipper from "unzipper";
import { db_url } from "../config.js";
import { deploymentSchema, hostSchema } from "../schema.js";

export interface DeploymentConfig {
  app: string[];
  routes: { url: string; file: string }[];
}

export interface DeploymentResult {
  projectRef: string;
  deploymentId: string;
  path: string;
}

/**
 * Validates deployment configuration format
 */
export function validateConfig(config: unknown): config is DeploymentConfig {
  if (typeof config !== "object" || !config) return false;

  const candidate = config as DeploymentConfig;
  return (
    Array.isArray(candidate.app) &&
    Array.isArray(candidate.routes) &&
    candidate.app.every((f) => typeof f === "string") &&
    candidate.routes.every(
      (r) =>
        typeof r === "object" &&
        typeof r.url === "string" &&
        typeof r.file === "string"
    )
  );
}

/**
 * Helper to determine content type based on file extension
 */
function getContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const types: { [key: string]: string } = {
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    ico: "image/x-icon",
  };

  return types[ext || ""] || "application/octet-stream";
}

/**
 * Save and extract the deployment bundle
 */
async function processBundle(bundle: File): Promise<string> {
  try {
    console.log("Starting bundle processing...");
    console.log("Converting bundle to array buffer...");
    const arrayBuffer = await bundle.arrayBuffer();
    console.log(`Array buffer size: ${arrayBuffer.byteLength} bytes`);

    console.log("Setting up streams...");
    const extractedPath = join(process.cwd(), "tmp", "extract");
    console.log(`Creating extraction directory: ${extractedPath}`);
    await mkdir(extractedPath, { recursive: true });

    console.log("Starting zip extraction...");
    const extractStream = unzipper.Extract({ path: extractedPath });

    // Add event listeners to debug extraction
    extractStream.on("entry", (entry) => {
      console.log(`Extracting: ${entry.path}`);
    });
    extractStream.on("error", (err) => {
      console.error("Extraction error:", err);
    });
    extractStream.on("close", () => {
      console.log("Extraction stream closed");
    });

    // Create a readable stream from the buffer and pipe it to the extract stream
    await new Promise((resolve, reject) => {
      const bufferStream = Readable.from(Buffer.from(arrayBuffer));

      bufferStream.pipe(extractStream).on("close", resolve).on("error", reject);
    });
    console.log("Zip extraction completed");

    return extractedPath;
  } catch (error) {
    console.error("Error processing bundle:", error);
    throw new Error(
      `Failed to process bundle: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Upload extracted files to Scaleway bucket
 */
async function uploadToS3(
  extractedPath: string,
  deploymentId: string,
  s3Client: S3Client,
  bucketName: string
): Promise<void> {
  try {
    // List all entries in the extracted directory
    const entries = await readdir(extractedPath, { recursive: true });

    // Upload each file (skip directories)
    for (const entry of entries) {
      const entryPath = join(extractedPath, entry);

      // Check if entry is a file
      const stats = await stat(entryPath);
      if (!stats.isFile()) continue;

      // Read and upload file
      const fileContent = await readFile(entryPath);
      const key = `deployments/${deploymentId}/${entry}`;

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: fileContent,
        ContentType: getContentType(entry),
      });

      try {
        await s3Client.send(command);
        console.log(`Uploaded: ${entry}`);
      } catch (error) {
        throw new Error(
          `Failed to upload ${entry}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  } finally {
    // Clean up temp directory
    await rm(extractedPath, { recursive: true, force: true });
  }
}

/**
 * Process a deployment request
 */
// Initialize database client
const client = new pg.Client({ connectionString: db_url });
await client.connect();
const db = drizzle(client);

interface DeployParams {
  projectRef: string;
  branchRef: string;
  bundle: File;
  config: DeploymentConfig;
  deploymentsRoot?: string;
  bucketName?: string;
}

export async function deploy({
  projectRef,
  branchRef,
  bundle,
  config,
  deploymentsRoot = join(process.cwd(), "deployments"),
  bucketName = process.env.BUCKET_NAME || "deployment-bucket",
}: DeployParams): Promise<DeploymentResult> {
  console.log("Starting deployment...");

  const s3Client = new S3Client({
    endpoint: process.env.BUCKET_URL,
    region: "us-east-1", // MinIO default region
    forcePathStyle: true, // Required for MinIO
    credentials: {
      accessKeyId: process.env.BUCKET_ACCESS_KEY || "",
      secretAccessKey: process.env.BUCKET_SECRET_KEY || "",
    },
  });

  // Validate config
  if (!validateConfig(config)) {
    throw new Error("Invalid config format");
  }

  console.log("Creating deployment record...");

  // Create deployment record with shortId
  const shortId = Math.random().toString(36).substring(2, 10);
  const [deployment] = await db
    .insert(deploymentSchema)
    .values({
      shortId,
      config: config,
    })
    .returning();

  let extractedPath: string | undefined;
  try {
    console.log("Processing bundle...");

    // Process bundle and upload to S3
    extractedPath = await processBundle(bundle);

    console.log("Bundle processed");
    console.log("Uploading files to bucket...");
    await uploadToS3(extractedPath, deployment.id, s3Client, bucketName);

    console.log("Files uploaded");
  } catch (error) {
    // Clean up extracted files if they exist
    if (extractedPath) {
      try {
        await rm(extractedPath, { recursive: true, force: true });
        console.log("Cleaned up temporary files after error");
      } catch (cleanupError) {
        console.error("Failed to clean up after error:", cleanupError);
      }
    }
    throw error;
  }

  // Create or update host record
  // origan.main is a placeholder for origan main domain
  const domain = `${projectRef}.${branchRef}.origan.main`;
  await db
    .insert(hostSchema)
    .values({
      name: domain,
      deploymentId: deployment.id,
    })
    .onConflictDoUpdate({
      target: hostSchema.name,
      set: {
        deploymentId: deployment.id,
      },
    });

  console.log("Database records created");

  return {
    projectRef,
    deploymentId: deployment.id,
    path: extractedPath,
  };
}
