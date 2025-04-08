import { execSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { Provider } from "@pulumi/aws";
import { BucketObjectv2 } from "@pulumi/aws/s3/bucketObjectv2";
import * as pulumi from "@pulumi/pulumi";
import * as std from "@pulumi/std";
import type * as scaleway from "@pulumiverse/scaleway";

// Get all files from the dist directory with their filepaths and hash keys
export interface FileInfo {
  filePath: string;
  key: string;
  hashKey: pulumi.Input<string>;
}

export interface ViteProjectInputs {
  folderPath: string;
  scaleway: {
    accessKey: string;
    secretKey: string;
    region: string;
  };
  buildEnv?: pulumi.Input<{ [key: string]: string }>;
}

export class ViteProject extends pulumi.ComponentResource {
  name: string;
  files: pulumi.Output<FileInfo[]>;
  s3Provider: Provider;

  constructor(
    name: string,
    args: ViteProjectInputs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super("origan:ViteProject", name, args, opts);
    this.s3Provider = new Provider("origan:s3", {
      endpoints: [
        {
          s3: `https://s3.${args.scaleway.region}.scw.cloud`,
        },
      ],
      accessKey: args.scaleway.accessKey,
      secretKey: args.scaleway.secretKey,
    });
    this.name = name;

    // TODO: Find a way to not have to rebuild the vite project each time.
    // FIXME: Find a way to not hardcode the output folder of the vite project, and instead read it
    // from Vite itself.
    const distPath = path.join(args.folderPath, "dist");
    pulumi.output(args.buildEnv).apply((env) => {
      this.buildViteProject(args.folderPath, env);
    });

    this.files = pulumi.output(this.getAllFiles(distPath));
    this.registerOutputs({ files: this.files });
  }

  buildViteProject(folderPath: string, env?: { [key: string]: string }) {
    console.log(`Building Vite project in ${folderPath}...`);
    execSync("pnpm run build", {
      cwd: folderPath,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    console.log("Vite project built successfully!");
  }

  getAllFiles(basePath: string): FileInfo[] {
    const recurse = (dirPath: string, arrayOfFiles: FileInfo[]) => {
      const files = fs.readdirSync(dirPath);

      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
          recurse(fullPath, arrayOfFiles);
        } else {
          const key = path.relative(basePath, fullPath);
          const contentHash = std
            .filemd5({ input: fullPath })
            .then((i) => i.result);

          arrayOfFiles.push({
            filePath: fullPath,
            key: key,
            hashKey: contentHash,
          });
        }
      }

      return arrayOfFiles;
    };

    return recurse(basePath, []);
  }

  // Calculate file content hash to detect changes
  calculateFileHash(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash("sha256");
    hashSum.update(fileBuffer);
    return hashSum.digest("hex");
  }

  deploy(bucket: scaleway.object.Bucket) {
    // Upload each file to the bucket
    this.files.apply((files) => {
      for (const fileInfo of files) {
        // Include hash in resource name to force update when content changes
        new BucketObjectv2(
          `${this.name}-bucket-item-${fileInfo.key.replace(/\//g, "-")}`,
          {
            key: fileInfo.key,
            bucket: bucket.name,
            source: new pulumi.asset.FileAsset(fileInfo.filePath),
            etag: fileInfo.hashKey,
            acl: "public-read",
          },
          {
            parent: this,
            provider: this.s3Provider,
          },
        );
      }
    });
  }
}
