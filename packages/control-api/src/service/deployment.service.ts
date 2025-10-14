import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { and, desc, eq, type SQLWrapper } from "drizzle-orm";
import * as tmp from "tmp-promise";
import * as unzipper from "unzipper";
import { env } from "../config.js";
import { getLogger } from "../instrumentation.js";
import { db } from "../libs/db/index.js";
import {
  deploymentSchema,
  domainSchema,
  projectSchema,
  trackSchema,
} from "../libs/db/schema.js";
import { putObject } from "../libs/s3.js";
import { deploymentConfigSchema } from "../schemas/deploy.js";
import { generateReference, REFERENCE_PREFIXES } from "../utils/reference.js";
import { generateDeploymentSubdomain } from "../utils/subdomain.js";
import { getLatestRevision } from "./environment.service.js";
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
async function processBundle(tmpDir: string, bundle: File) {
  const log = getLogger();

  try {
    log.info("Starting bundle processing...");
    log.info("Converting bundle to array buffer...");
    const arrayBuffer = await bundle.arrayBuffer();
    log.info(`Array buffer size: ${arrayBuffer.byteLength} bytes`);

    log.info("Starting zip extraction...");
    const extractStream = unzipper.Extract({ path: tmpDir });

    log.info("Setting up streams...");
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
    // Entry already contains the correct path structure (app/... or api/...)
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
  environmentId,
  isSystemTrack,
}: {
  projectRef: string;
  buildId?: string;
  trackName?: string;
  environmentId?: string;
  isSystemTrack?: boolean;
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
    ? await getOrCreateTrack({
        projectId: project.id,
        name: trackName,
        isSystem: isSystemTrack,
        environmentId,
      })
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

  const project = await db.query.projectSchema.findFirst({
    where: and(eq(projectSchema.reference, projectRef)),
  });

  if (!project) {
    throw new ProjectNotFoundError(`Project ${projectRef} not found`);
  }

  const deployment = await getDeployment({ id: deploymentId });
  if (!deployment) {
    throw new Error("Deployment not found");
  }

  // Get environment variables for the deployment
  let environmentVariables: Record<string, string> = {};
  let environmentRevisionId: string | null = null;

  if (deployment.trackId) {
    const track = await db.query.trackSchema.findFirst({
      where: eq(trackSchema.id, deployment.trackId),
    });

    if (track?.environmentId) {
      const latestRevision = await getLatestRevision(track.environmentId);
      if (latestRevision) {
        environmentRevisionId = latestRevision.id;
        environmentVariables = latestRevision.variables as Record<
          string,
          string
        >;
        log.info(
          `Found ${Object.keys(environmentVariables).length} environment variables for deployment`,
        );
      }
    }
  }

  // Update deployment with config, status, and environment revision
  await db
    .update(deploymentSchema)
    .set({
      config: result.data,
      status: "deploying",
      environmentRevisionId,
    })
    .where(eq(deploymentSchema.id, deploymentId));

  log.info("Processing bundle...");

  try {
    // Process bundle and upload to S3
    await tmp.withDir(
      async (tmpDir) => {
        log.withContext({ tmpDir }).info("Using tmp path");
        await processBundle(tmpDir.path, bundle);
        log.info("Bundle processed");
        log.info("Uploading files to bucket...");

        await uploadToS3(tmpDir.path, deployment.id, bucketName);

        // Upload metadata.json with deployment info and environment variables
        const metadata = {
          deploymentId: deployment.id,
          projectId: project.id,
          environmentRevisionId,
          createdAt: new Date().toISOString(),
          environmentVariables,
        };

        const metadataKey = `deployments/${deployment.id}/metadata.json`;
        await putObject(
          bucketName,
          metadataKey,
          Buffer.from(JSON.stringify(metadata, null, 2)),
          "application/json",
        );
        log.info("Uploaded deployment metadata");

        // update track domains if track was provided
        if (deployment.trackId) {
          await updateTrackDomains(deployment.trackId);
        }
      },
      { unsafeCleanup: true },
    );

    log.info("Files uploaded");

    // Set deployment status to success
    await db
      .update(deploymentSchema)
      .set({ status: "success" })
      .where(eq(deploymentSchema.id, deploymentId));

    // Create or update domain record
    const subdomain = generateDeploymentSubdomain(project.reference);
    const domain = `${subdomain}.${env.ORIGAN_DEPLOY_DOMAIN}`;

    await db
      .insert(domainSchema)
      .values({
        name: domain,
        deploymentId: deployment.id,
        projectId: project.id,
      })
      .onConflictDoUpdate({
        target: domainSchema.name,
        set: {
          deploymentId: deployment.id,
        },
      });

    log.info("Database records created");
    return {
      projectRef,
      deploymentId: deployment.id,
      urls: [`https://${domain}`],
    };
  } catch (err) {
    // Set deployment status to error
    await db
      .update(deploymentSchema)
      .set({ status: "error" })
      .where(eq(deploymentSchema.id, deploymentId));
    log.withError(err).error("woops");
    throw err;
  }
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
