import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { type Context, Resource } from "alchemy";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const fsPromises = fs.promises;

/**
 * Properties for deploying a static site to Garage
 */
export interface GarageStaticSiteProps {
  /**
   * Path to the directory containing static files
   */
  sourceDir: string;

  /**
   * Target bucket name
   */
  bucketName: string;

  /**
   * S3 endpoint
   */
  endpoint: string;

  /**
   * Access key ID
   */
  accessKeyId: string;

  /**
   * Secret access key
   */
  secretAccessKey: string;

  /**
   * Region (default: garage)
   */
  region?: string;

  /**
   * Content hash to trigger redeployment
   */
  contentHash?: string;

  /**
   * Delete files in bucket that don't exist locally
   */
  cleanupOrphaned?: boolean;
}

/**
 * Static site deployment resource output
 */
export interface GarageStaticSite
  extends Resource<"garage::StaticSite">,
    GarageStaticSiteProps {
  /**
   * Website URL
   */
  websiteUrl: string;

  /**
   * Number of files uploaded
   */
  filesUploaded: number;

  /**
   * Deployment timestamp
   */
  deployedAt: number;
}

/**
 * Calculate hash of directory contents
 */
async function calculateDirHash(dirPath: string): Promise<string> {
  const hash = crypto.createHash("sha256");

  async function processDir(dir: string) {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(dirPath, fullPath);

      if (entry.isDirectory()) {
        hash.update(`dir:${relativePath}`);
        await processDir(fullPath);
      } else if (entry.isFile()) {
        const stats = await fsPromises.stat(fullPath);
        const content = await fsPromises.readFile(fullPath);
        hash.update(`file:${relativePath}:${stats.size}:`);
        hash.update(content);
      }
    }
  }

  await processDir(dirPath);
  return hash.digest("hex");
}

/**
 * Get MIME type for file
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".eot": "application/vnd.ms-fontobject",
    ".txt": "text/plain",
    ".xml": "application/xml",
    ".pdf": "application/pdf",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".webm": "video/webm",
    ".mp4": "video/mp4",
    ".wasm": "application/wasm",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * Deploy static site files to a Garage bucket
 *
 * @example
 * // Deploy admin
 * const admin = await GarageStaticSite("admin-deployment", {
 *   sourceDir: "./packages/admin/dist",
 *   bucketName: adminBucket.name,
 *   endpoint: adminBucket.endpoint,
 *   accessKeyId: adminBucket.accessKeyId,
 *   secretAccessKey: adminBucket.secretAccessKey,
 *   cleanupOrphaned: true
 * });
 */
export const GarageStaticSite = Resource(
  "garage::StaticSite",
  async function (
    this: Context<GarageStaticSite>,
    name: string,
    props: GarageStaticSiteProps,
  ): Promise<GarageStaticSite> {
    const region = props.region || "garage";

    if (this.phase === "delete") {
      // We don't delete the files on resource deletion
      // The bucket deletion should handle that
      console.log(`Static site deployment ${name} removed from tracking`);
      return this.destroy();
    }

    // Calculate current content hash if not provided
    let contentHash = props.contentHash;
    if (!contentHash) {
      console.log(`Calculating content hash for ${props.sourceDir}...`);
      contentHash = await calculateDirHash(props.sourceDir);
    }

    console.log(
      `Deploying static site ${name} from ${props.sourceDir} to ${props.bucketName}...`,
    );

    // Create S3 client for Garage
    const s3Client = new S3Client({
      endpoint: props.endpoint,
      region: region,
      credentials: {
        accessKeyId: props.accessKeyId,
        secretAccessKey: props.secretAccessKey,
      },
      forcePathStyle: true, // Important for Garage
    });

    // Get list of local files
    const localFiles = new Map<string, string>(); // relativePath -> fullPath
    async function collectFiles(dir: string, baseDir: string) {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await collectFiles(fullPath, baseDir);
        } else if (entry.isFile()) {
          const relativePath = path.relative(baseDir, fullPath);
          localFiles.set(relativePath, fullPath);
        }
      }
    }
    await collectFiles(props.sourceDir, props.sourceDir);

    // Get list of existing files in bucket
    const existingFiles = new Set<string>();
    if (props.cleanupOrphaned) {
      try {
        const listCommand = new ListObjectsV2Command({
          Bucket: props.bucketName,
        });
        const response = await s3Client.send(listCommand);

        if (response.Contents) {
          for (const obj of response.Contents) {
            if (obj.Key) {
              existingFiles.add(obj.Key);
            }
          }
        }
      } catch (_error) {
        console.log("No existing files in bucket or error listing");
      }
    }

    // Upload files
    let filesUploaded = 0;
    const uploadErrors: string[] = [];

    for (const [relativePath, fullPath] of localFiles) {
      try {
        const fileContent = await fsPromises.readFile(fullPath);
        const mimeType = getMimeType(relativePath);

        const putCommand = new PutObjectCommand({
          Bucket: props.bucketName,
          Key: relativePath,
          Body: fileContent,
          ContentType: mimeType,
          // Make files publicly readable for website
          ACL: "public-read",
        });

        await s3Client.send(putCommand);
        filesUploaded++;

        if (filesUploaded % 10 === 0) {
          console.log(`Uploaded ${filesUploaded}/${localFiles.size} files...`);
        }
      } catch (error) {
        console.error(`Failed to upload ${relativePath}:`, error);
        uploadErrors.push(relativePath);
      }
    }

    // Delete orphaned files
    if (props.cleanupOrphaned && existingFiles.size > 0) {
      const orphanedFiles = Array.from(existingFiles).filter(
        (f) => !localFiles.has(f),
      );
      if (orphanedFiles.length > 0) {
        console.log(`Deleting ${orphanedFiles.length} orphaned files...`);
        for (const file of orphanedFiles) {
          try {
            const deleteCommand = new DeleteObjectCommand({
              Bucket: props.bucketName,
              Key: file,
            });
            await s3Client.send(deleteCommand);
          } catch (error) {
            console.error(`Failed to delete ${file}:`, error);
          }
        }
      }
    }

    if (uploadErrors.length > 0) {
      console.warn(
        `Failed to upload ${uploadErrors.length} files: ${uploadErrors.join(", ")}`,
      );
    }

    console.log(`✅ Deployed ${filesUploaded} files to ${props.bucketName}`);

    const websiteUrl = `${props.endpoint}/${props.bucketName}`;

    return this({
      ...props,
      contentHash,
      websiteUrl,
      filesUploaded,
      deployedAt: Date.now(),
    });
  },
);
