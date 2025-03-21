import * as pulumi from "@pulumi/pulumi";
import * as scaleway from "@lbrlabs/pulumi-scaleway";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import * as crypto from "crypto";

const projectName = "origan-test";

// Create a Scaleway resource (Object Bucket).
const bucket = new scaleway.ObjectBucket(`${projectName}-bucket`, {
  name: "origan-test-bucket",
  region: "fr-par",
});
new scaleway.ObjectBucketAcl(`${projectName}-bucket-acl`, {
  bucket: bucket.name,
  acl: "public-read",
});

// Configure website hosting
const bucketWebsiteConfig = new scaleway.ObjectBucketWebsiteConfiguration(
  `${projectName}-bucket-website-config`,
  {
    bucket: bucket.name,
    region: "fr-par",
    indexDocument: {
      suffix: "index.html",
    },
    errorDocument: {
      key: "index.html", // SPA fallback - all routes go to index.html
    },
  },
);

// Get all files from the dist directory with their filepaths and hash keys
interface FileInfo {
  filePath: string;
  key: string;
  hashKey: string;
}

class ViteProject extends pulumi.ComponentResource {
  files: pulumi.Output<FileInfo[]>;

  constructor(
    name: string,
    args: { folderPath: string },
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super("origan:ViteProject", name, args, opts);

    const distPath = path.join(args.folderPath, "dist");
    this.buildViteProject(args.folderPath, distPath);

    this.files = pulumi.output(this.getAllFiles(distPath));
    this.registerOutputs({ files: this.files });
  }

  buildViteProject(folderPath: string, distPath: string) {
    console.log("Building Vite project...");
    execSync(`bun run build --outDir ${distPath}`, {
      cwd: folderPath,
      stdio: "inherit",
    });
    console.log("Vite project built successfully!");
  }

  getAllFiles(basePath: string): FileInfo[] {
    const recurse = (dirPath: string, arrayOfFiles: FileInfo[]) => {
      const files = fs.readdirSync(dirPath);

      files.forEach((file) => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
          recurse(fullPath, arrayOfFiles);
        } else {
          const key = path.relative(basePath, fullPath);
          const contentHash = this.calculateFileHash(fullPath);
          const hashKey = contentHash.substring(0, 8);

          arrayOfFiles.push({
            filePath: fullPath,
            key: key,
            hashKey: hashKey,
          });
        }
      });

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
}

const viteProject = new ViteProject("vite-project", {
  folderPath: path.join(__dirname, "..", "origan-example-deployment"),
});

// Upload each file to the bucket
viteProject.files.apply((files) => {
  files.forEach((fileInfo) => {
    // Include hash in resource name to force update when content changes
    new scaleway.ObjectItem(
      `${projectName}-bucket-item-${fileInfo.key.replace(/\//g, "-")}`,
      {
        key: fileInfo.key,
        bucket: bucket.name,
        file: fileInfo.filePath,
        region: "fr-par",
        visibility: "public-read",
        metadata: {
          hash: fileInfo.hashKey,
        },
      },
      { deleteBeforeReplace: true, replaceOnChanges: ["metadata.hash"] },
    );
  });
});

// Export the name of the bucket
export const bucketName = bucket.id;

// Export the website endpoint
export const bucketWebsiteUrl = pulumi.interpolate`https://${bucket.name}.s3-website.fr-par.scw.cloud`;
export const websiteUrl = bucketWebsiteConfig.websiteEndpoint;
