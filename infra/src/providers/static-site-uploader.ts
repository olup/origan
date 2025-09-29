import * as pulumi from "@pulumi/pulumi";
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import * as fs from "fs";
import * as path from "path";
import * as mime from "mime-types";
import { glob } from "glob";
import * as crypto from "crypto";

interface StaticSiteUploaderInputs {
  bucketName: pulumi.Input<string>;
  sourcePath: string;
  bucketEndpoint?: pulumi.Input<string>;
  accessKeyId?: pulumi.Input<string>;
  secretAccessKey?: pulumi.Input<string>;
  invalidateOnChange?: boolean;
  deleteOrphaned?: boolean;
}

interface StaticSiteUploaderOutputs {
  bucketName: string;
  filesUploaded: number;
  contentHash: string;
  uploadedFiles: string[];
}

class StaticSiteUploaderProvider implements pulumi.dynamic.ResourceProvider {
  async create(inputs: any): Promise<pulumi.dynamic.CreateResult<StaticSiteUploaderOutputs>> {
    const uploadResult = await this.uploadFiles(inputs);
    return {
      id: `${inputs.bucketName}-${Date.now()}`,
      outs: uploadResult,
    };
  }

  async update(id: string, olds: StaticSiteUploaderOutputs, news: any): Promise<pulumi.dynamic.UpdateResult<StaticSiteUploaderOutputs>> {
    // Calculate content hash to detect changes
    const newHash = await this.calculateContentHash(news.sourcePath);
    
    if (olds.contentHash !== newHash || news.invalidateOnChange) {
      const uploadResult = await this.uploadFiles(news);
      return { outs: uploadResult };
    }
    
    return { outs: olds };
  }

  async delete(id: string, props: StaticSiteUploaderOutputs) {
    // Optionally clean up bucket contents
    // For now, we'll leave files in place as bucket has forceDestroy
    pulumi.log.info(`Static site ${props.bucketName} resources marked for deletion`);
  }

  private async uploadFiles(inputs: any): Promise<StaticSiteUploaderOutputs> {
    // At this point, all Inputs are resolved to plain values
    const s3Client = new S3Client({
      endpoint: inputs.bucketEndpoint || process.env.GARAGE_ENDPOINT,
      region: "us-east-1", // Garage doesn't care about region
      credentials: {
        accessKeyId: inputs.accessKeyId || process.env.GARAGE_ACCESS_KEY || "",
        secretAccessKey: inputs.secretAccessKey || process.env.GARAGE_SECRET_KEY || "",
      },
      forcePathStyle: true, // Required for S3-compatible services
    });

    // Ensure source path exists
    if (!fs.existsSync(inputs.sourcePath)) {
      throw new Error(`Source path does not exist: ${inputs.sourcePath}`);
    }

    // Find all files to upload
    const files = glob.sync("**/*", {
      cwd: inputs.sourcePath,
      nodir: true,
      dot: true, // Include dotfiles
    });

    if (files.length === 0) {
      pulumi.log.warn(`No files found in ${inputs.sourcePath}`);
    }

    const uploadedFiles: string[] = [];

    // Upload each file
    for (const file of files) {
      const filePath = path.join(inputs.sourcePath, file);
      const fileContent = fs.readFileSync(filePath);
      const contentType = mime.lookup(file) || "application/octet-stream";

      try {
        await s3Client.send(new PutObjectCommand({
          Bucket: inputs.bucketName as string,
          Key: file,
          Body: fileContent,
          ContentType: contentType,
          CacheControl: this.getCacheControl(file),
        }));

        uploadedFiles.push(file);
        pulumi.log.debug(`Uploaded: ${file} (${contentType})`);
      } catch (error) {
        pulumi.log.error(`Failed to upload ${file}: ${error}`);
        throw error;
      }
    }

    // Delete orphaned files if requested
    if (inputs.deleteOrphaned) {
      await this.deleteOrphanedFiles(s3Client, inputs.bucketName as string, uploadedFiles);
    }

    const contentHash = await this.calculateContentHash(inputs.sourcePath);

    pulumi.log.info(`Uploaded ${uploadedFiles.length} files to ${inputs.bucketName}`);

    return {
      bucketName: inputs.bucketName as string,
      filesUploaded: uploadedFiles.length,
      contentHash,
      uploadedFiles,
    };
  }

  private async deleteOrphanedFiles(s3Client: S3Client, bucketName: string, uploadedFiles: string[]) {
    try {
      // List all objects in the bucket
      const listResponse = await s3Client.send(new ListObjectsV2Command({
        Bucket: bucketName,
      }));

      if (!listResponse.Contents) return;

      const uploadedSet = new Set(uploadedFiles);
      const toDelete = listResponse.Contents
        .filter(obj => obj.Key && !uploadedSet.has(obj.Key))
        .map(obj => ({ Key: obj.Key! }));

      if (toDelete.length > 0) {
        await s3Client.send(new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: toDelete,
          },
        }));
        pulumi.log.info(`Deleted ${toDelete.length} orphaned files from ${bucketName}`);
      }
    } catch (error) {
      pulumi.log.warn(`Failed to delete orphaned files: ${error}`);
    }
  }

  private async calculateContentHash(sourcePath: string): Promise<string> {
    const files = glob.sync("**/*", { cwd: sourcePath, nodir: true }).sort();
    const hash = crypto.createHash("sha256");
    
    for (const file of files) {
      const filePath = path.join(sourcePath, file);
      const content = fs.readFileSync(filePath);
      hash.update(file);
      hash.update(content);
    }
    
    return hash.digest("hex").substring(0, 16); // Use first 16 chars for brevity
  }

  private getCacheControl(filename: string): string {
    // Immutable for hashed assets (contains hash in filename)
    if (filename.match(/\.[0-9a-f]{8,}\./)) {
      return "public, max-age=31536000, immutable";
    }
    // Short cache for HTML
    if (filename.endsWith(".html") || filename === "index.html") {
      return "public, max-age=300, must-revalidate";
    }
    // Medium cache for images
    if (filename.match(/\.(jpg|jpeg|png|gif|svg|ico|webp)$/i)) {
      return "public, max-age=86400";
    }
    // Default cache for CSS/JS
    return "public, max-age=3600";
  }
}

// Export the custom resource class
export class StaticSiteUploader extends pulumi.dynamic.Resource {
  public readonly bucketName!: pulumi.Output<string>;
  public readonly filesUploaded!: pulumi.Output<number>;
  public readonly contentHash!: pulumi.Output<string>;
  public readonly uploadedFiles!: pulumi.Output<string[]>;

  constructor(name: string, args: StaticSiteUploaderInputs, opts?: pulumi.CustomResourceOptions) {
    super(new StaticSiteUploaderProvider(), name, {
      ...args,
      bucketName: pulumi.output(args.bucketName),
    }, opts);
  }
}