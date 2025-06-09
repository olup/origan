import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { type SQLWrapper, eq } from "drizzle-orm";
import { and } from "drizzle-orm";
import * as unzipper from "unzipper";
import { env } from "../config.js";
import { db } from "../libs/db/index.js";
import {
  deploymentSchema,
  hostSchema,
  projectSchema,
} from "../libs/db/schema.js";
import { putObject } from "../libs/s3.js";
import {
  type DeployParams,
  deploymentConfigSchema,
} from "../schemas/deploy.js";
import { generateReference } from "../utils/reference.js";
import { log } from "../instrumentation.js";

// Custom Error Types
export class BundleProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleProcessingError";
  }
}

export class S3UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "S3UploadError";
  }
}

export class InvalidConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidConfigError";
  }
}

export class ProjectNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectNotFoundError";
  }
}

export interface DeploymentResult {
  projectRef: string;
  deploymentId: string;
  path: string;
  urls: string[];
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
    log.info("Starting bundle processing...");
    log.info("Converting bundle to array buffer...");
    const arrayBuffer = await bundle.arrayBuffer();
    log.info(`Array buffer size: ${arrayBuffer.byteLength} bytes`);

    log.info("Setting up streams...");
    const extractedPath = join(process.cwd(), "tmp", "extract");
    log.info(`Creating extraction directory: ${extractedPath}`);
    await mkdir(extractedPath, { recursive: true });

    log.info("Starting zip extraction...");
    const extractStream = unzipper.Extract({ path: extractedPath });

    // Add event listeners to debug extraction
    extractStream.on("entry", (entry) => {
      log.info(`Extracting: ${entry.path}`);
    });
    extractStream.on("error", (err) => {
      log.withError(err).error("Extraction error");
    });
    extractStream.on("close", () => {
      log.info("Extraction stream closed");
    });

    // Create a readable stream from the buffer and pipe it to the extract stream
    await new Promise((resolve, reject) => {
      const bufferStream = Readable.from(Buffer.from(arrayBuffer));

      bufferStream.pipe(extractStream).on("close", resolve).on("error", reject);
    });
    log.info("Zip extraction completed");

    return extractedPath;
  } catch (error) {
    log.withError(error).error("Error processing bundle");
    throw new BundleProcessingError(
      `Failed to process bundle: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Upload extracted files to Scaleway bucket
 */
async function uploadToS3(
  extractedPath: string,
  deploymentId: string,
  bucketName: string,
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

      try {
        await putObject(bucketName, key, fileContent, getContentType(entry));
        log.info(`Uploaded: ${entry}`);
      } catch (error) {
        throw new S3UploadError(
          `Failed to upload ${entry}: ${
            error instanceof Error ? error.message : String(error)
          }`,
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

export async function deploy({
  projectRef,
  bundle,
  config,
  bucketName = process.env.BUCKET_NAME || "deployment-bucket",
}: DeployParams): Promise<DeploymentResult> {
  log.info("Starting deployment...");

  // Validate config
  const result = deploymentConfigSchema.safeParse(config);
  if (!result.success) {
    throw new InvalidConfigError(
      `Invalid config format: ${result.error.message}`,
    );
  }

  // Get or create project
  const project = await db.query.projectSchema.findFirst({
    where: and(eq(projectSchema.reference, projectRef)),
  });

  if (!project) {
    throw new ProjectNotFoundError(`Project ${projectRef} not found`);
  }

  log.info("Creating deployment record...");

  const deployment = await createDeployment({
    projectId: project.id,
    config: result.data,
  });

  if (!deployment) {
    throw new Error("Failed to create deployment record");
  }

  let extractedPath: string | undefined;
  try {
    log.info("Processing bundle...");

    // Process bundle and upload to S3
    extractedPath = await processBundle(bundle);

    log.info("Bundle processed");
    log.info("Uploading files to bucket...");

    await uploadToS3(extractedPath, deployment.id, bucketName);

    log.info("Files uploaded");
  } catch (error) {
    // Clean up extracted files if they exist
    if (extractedPath) {
      try {
        await rm(extractedPath, { recursive: true, force: true });
        log.info("Cleaned up temporary files after error");
      } catch (cleanupError) {
        log.withError(cleanupError).error("Failed to clean up after error");
      }
    }
    throw error;
  }

  // Create or update host record
  const domain = `${deployment.reference}--${project.reference}.`;

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

  log.info("Database records created");

  return {
    projectRef,
    deploymentId: deployment.id,
    path: extractedPath,
    urls: [`https://${domain}${env.ORIGAN_DEPLOY_DOMAIN}`],
  };
}

export const createDeployment = async (
  data: Omit<typeof deploymentSchema.$inferInsert, "reference">,
) => {
  const [deployment] = await db
    .insert(deploymentSchema)
    .values({
      reference: generateReference(),
      ...data,
    })
    .returning();
  return deployment;
};

export async function getDeployment(filter: {
  userId: string;
  id?: string;
  reference?: string;
}) {
  if (filter.id == null && filter.reference == null) {
    throw new Error("Either id or reference must be provided");
  }

  const clauses: SQLWrapper[] = [];
  if (filter.id) {
    clauses.push(eq(deploymentSchema.id, filter.id));
  } else if (filter.reference) {
    clauses.push(eq(deploymentSchema.reference, filter.reference));
  }

  const deployment = await db.query.deploymentSchema.findFirst({
    where: and(...clauses),
    with: {
      project: {
        columns: {
          id: true,
        },
      },
    },
  });

  return deployment;
}
