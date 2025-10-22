import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as command from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";

export interface S3DirectorySyncArgs {
  sourceDir: string;
  bucketName: pulumi.Input<string>;
  endpoint: string;
  accessKey: pulumi.Input<string>;
  secretKey: pulumi.Input<string>;
  region?: string;
  prefix?: string;
}

/**
 * Component resource that syncs a directory to S3 using AWS CLI
 */
export class S3DirectorySync extends pulumi.ComponentResource {
  public readonly fileCount: pulumi.Output<number>;
  public readonly syncedAt: pulumi.Output<string>;
  public readonly directoryHash: pulumi.Output<string>;

  constructor(
    name: string,
    args: S3DirectorySyncArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super("origan:s3:DirectorySync", name, {}, opts);

    if (!fs.existsSync(args.sourceDir)) {
      pulumi.log.warn(`Source directory not found: ${args.sourceDir}`);
      this.fileCount = pulumi.output(0);
      this.syncedAt = pulumi.output("not synced");
      this.directoryHash = pulumi.output("");
      this.registerOutputs();
      return;
    }

    // Helper: recursively hash all files in a directory
    function hashDirectory(dir: string): string {
      const hash = crypto.createHash("sha256");

      function walk(current: string, prefix = "") {
        const entries = fs.readdirSync(current, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(current, entry.name);
          const relativePath = path.join(prefix, entry.name);

          if (entry.isDirectory()) {
            if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
              walk(fullPath, relativePath);
            }
          } else if (entry.isFile()) {
            const data = fs.readFileSync(fullPath);
            hash.update(relativePath);
            hash.update(data);
          }
        }
      }

      walk(dir);
      return hash.digest("hex").substring(0, 16);
    }

    // Calculate directory hash for change detection
    const dirHash = hashDirectory(args.sourceDir);
    pulumi.log.info(`Directory ${args.sourceDir} hash: ${dirHash}`);

    // Count files for output
    let fileCount = 0;
    function countFiles(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
            countFiles(fullPath);
          }
        } else if (entry.isFile()) {
          fileCount++;
        }
      }
    }
    countFiles(args.sourceDir);

    // Build S3 URI
    const bucketUri = pulumi.interpolate`s3://${args.bucketName}${args.prefix ? `/${args.prefix}` : ""}`;

    // Build AWS CLI environment variables
    const env = pulumi
      .all([args.accessKey, args.secretKey])
      .apply(([accessKey, secretKey]) => ({
        AWS_ACCESS_KEY_ID: accessKey,
        AWS_SECRET_ACCESS_KEY: secretKey,
        AWS_REGION: args.region || "garage",
        AWS_ENDPOINT_URL: args.endpoint,
      }));

    // Run sync only if hash changes
    const syncCommand = new command.local.Command(
      `${name}-sync`,
      {
        create: pulumi.interpolate`aws s3 sync ${args.sourceDir} ${bucketUri} --delete`,
        update: pulumi.interpolate`aws s3 sync ${args.sourceDir} ${bucketUri} --delete`,
        triggers: [dirHash], // Hash drives whether this runs
        environment: env,
      },
      { parent: this },
    );

    // Set outputs
    this.fileCount = pulumi.output(fileCount);
    this.syncedAt = syncCommand.stdout.apply(() => new Date().toISOString());
    this.directoryHash = pulumi.output(dirHash);

    this.registerOutputs({
      fileCount: this.fileCount,
      syncedAt: this.syncedAt,
      directoryHash: this.directoryHash,
    });
  }
}
