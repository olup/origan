import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { GarageBucket } from "../resources/garage/bucket.js";
import { GarageStaticSite } from "../resources/garage/static-site.js";
import { Ingress } from "../resources/k3s/ingress.js";
import { TraefikMiddleware } from "../resources/k3s/middleware.js";

export interface AdminDeploymentResult {
  bucket: GarageBucket;
  deployment: GarageStaticSite;
  middleware: TraefikMiddleware;
  ingress: Ingress;
}

/**
 * Calculate a simple hash of directory contents for change detection
 */
async function calculateDirHash(dirPath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  
  async function processDir(dir: string) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(dirPath, fullPath);
      
      if (entry.isDirectory()) {
        hash.update(`dir:${relativePath}`);
        await processDir(fullPath);
      } else if (entry.isFile()) {
        const stats = await fs.promises.stat(fullPath);
        const content = await fs.promises.readFile(fullPath);
        hash.update(`file:${relativePath}:${stats.size}:`);
        hash.update(content);
      }
    }
  }
  
  await processDir(dirPath);
  return hash.digest("hex").substring(0, 16); // Use first 16 chars for brevity
}

/**
 * Deploy the Origan Admin as a static website
 */
export async function deployAdmin(): Promise<AdminDeploymentResult> {
  // Create Garage bucket for Admin
  const adminBucket = await GarageBucket("origan-admin-app", {
    endpoint: process.env.GARAGE_ENDPOINT || "https://s3.platform.origan.dev",
    keyName: "origan-admin-app",
    website: true,
    indexDocument: "index.html",
    errorDocument: "index.html", // For SPA routing
  });

  // Calculate content hash to trigger updates when files change
  const sourceDir = "../packages/admin/dist";
  const contentHash = await calculateDirHash(sourceDir);
  console.log(`Admin app content hash: ${contentHash}`);

  // Deploy Admin files
  const adminDeployment = await GarageStaticSite("admin-deployment", {
    sourceDir,
    bucketName: adminBucket.name,
    endpoint: adminBucket.endpoint,
    accessKeyId: adminBucket.accessKeyId,
    secretAccessKey: adminBucket.secretAccessKey,
    cleanupOrphaned: true,
    contentHash, // This will trigger updates when content changes
  });

  // Create middleware for Host header rewrite in platform namespace (same as Garage)
  const adminMiddleware = await TraefikMiddleware("origan-admin-headers", {
    namespace: "platform",
    type: "headers",
    config: {
      customRequestHeaders: {
        Host: "origan-admin-app",
      },
    },
  });

  // Create Ingress in platform namespace (same as Garage service)
  const adminIngress = await Ingress("origan-admin-ingress", {
    namespace: "platform",
    hostname: "app.origan.dev",
    backend: {
      service: "garage", // Direct reference to garage service in same namespace
      port: 3902,
    },
    tls: true,
    annotations: {
      // Use Traefik middleware to rewrite Host header
      "traefik.ingress.kubernetes.io/router.middlewares":
        adminMiddleware.reference,
    },
  });

  return {
    bucket: adminBucket,
    deployment: adminDeployment,
    middleware: adminMiddleware,
    ingress: adminIngress,
  };
}
