import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { and, desc, eq, type SQLWrapper } from "drizzle-orm";
import * as unzipper from "unzipper";
import { env } from "../config.js";
import { getLogger } from "../instrumentation.js";
import { db } from "../libs/db/index.js";
import {
  deploymentSchema,
  domainSchema,
  projectSchema,
} from "../libs/db/schema.js";
import { putObject } from "../libs/s3.js";
import { deploymentConfigSchema } from "../schemas/deploy.js";
import { generateReference, REFERENCE_PREFIXES } from "../utils/reference.js";
import { getOrCreateTrack, updateTrackDomains } from "./track.service.js";

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
  const log = getLogger();

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
  const log = getLogger();

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

/**
 * Initiate a deployment: creates the deployment record (and track if needed)
 */
export async function initiateDeployment({
  projectRef,
  buildId,
  trackName,
}: {
  projectRef: string;
  buildId?: string;
  trackName?: string;
}) {
  const log = getLogger();

  log.info(
    `Initiating deployment for project ${projectRef} with track ${trackName}`,
  );

  // TODO: this should belong to a service
  const project = await db.query.projectSchema.findFirst({
    where: and(eq(projectSchema.reference, projectRef)),
  });

  if (!project) {
    throw new ProjectNotFoundError(`Project ${projectRef} not found`);
  }

  const trackObject = trackName
    ? await getOrCreateTrack(project.id, trackName)
    : undefined;

  if (!trackObject && trackName) {
    throw new InvalidConfigError(
      `Track ${trackName} not found or could not be created`,
    );
  }

  const [deployment] = await db
    .insert(deploymentSchema)
    .values({
      reference: generateReference(10, REFERENCE_PREFIXES.DEPLOYMENT),
      projectId: project.id,
      status: "pending",
      buildId,
      ...(trackName ? { trackId: trackObject?.id } : {}),
    })
    .returning();

  if (!deployment) {
    throw new Error("Failed to create deployment record");
  }

  return { project, deployment, trackObject };
}

/**
 * Operate a deployment: validates config, processes the bundle, uploads files, updates status and domains
 */
export async function operateDeployment({
  deploymentId,
  projectRef,
  config,
  bundle,
  bucketName = env.BUCKET_NAME || "deployment-bucket",
}: {
  deploymentId: string;
  projectRef: string;
  config: unknown;
  bundle: File;
  bucketName?: string;
}) {
  const log = getLogger();

  // Validate config
  const result = deploymentConfigSchema.safeParse(config);
  if (!result.success) {
    throw new InvalidConfigError(
      `Invalid config format: ${result.error.message}`,
    );
  }

  // Update deployment with config and status
  await db
    .update(deploymentSchema)
    .set({ config: result.data, status: "deploying" })
    .where(eq(deploymentSchema.id, deploymentId));

  const deployment = await getDeployment({ id: deploymentId });
  if (!deployment) {
    throw new Error("Deployment not found");
  }

  const project = await db.query.projectSchema.findFirst({
    where: and(eq(projectSchema.reference, projectRef)),
  });

  if (!project) {
    throw new ProjectNotFoundError(`Project ${projectRef} not found`);
  }

  let extractedPath: string | undefined;
  try {
    log.info("Processing bundle...");

    // Process bundle and upload to S3
    extractedPath = await processBundle(bundle);

    log.info("Bundle processed");
    log.info("Uploading files to bucket...");

    await uploadToS3(extractedPath, deploymentId, bucketName);

    // update track domains if track was provided
    if (deployment.trackId) {
      await updateTrackDomains(deployment.trackId);
    }

    log.info("Files uploaded");

    // Set deployment status to success
    await db
      .update(deploymentSchema)
      .set({ status: "success" })
      .where(eq(deploymentSchema.id, deploymentId));
  } catch (error) {
    // Set deployment status to error
    await db
      .update(deploymentSchema)
      .set({ status: "error" })
      .where(eq(deploymentSchema.id, deploymentId));
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

  // Create or update domain record
  const domain = `${deployment.reference}--${project.reference}.`;

  await db
    .insert(domainSchema)
    .values({
      name: domain,
      deploymentId,
      projectId: project.id,
    })
    .onConflictDoUpdate({
      target: domainSchema.name,
      set: {
        deploymentId,
      },
    });

  log.info("Database records created");

  return {
    projectRef,
    deploymentId,
    path: extractedPath,
  };
}

export async function getDeployment(filter: {
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
      project: true,
      track: true,
      build: true,
      domains: true,
    },
  });

  return deployment;
}

export async function getDeploymentsByProject(projectId: string) {
  const deployments = await db.query.deploymentSchema.findMany({
    where: eq(deploymentSchema.projectId, projectId),
    with: {
      project: true,
      track: true,
      build: true,
      domains: true,
    },
    orderBy: [desc(deploymentSchema.createdAt)],
  });

  return deployments;
}
