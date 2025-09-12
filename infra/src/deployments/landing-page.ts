import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { GarageBucket } from "../resources/garage/bucket.js";
import { GarageStaticSite } from "../resources/garage/static-site.js";
import { Ingress } from "../resources/k3s/ingress.js";
import { TraefikMiddleware } from "../resources/k3s/middleware.js";

export interface LandingPageDeploymentResult {
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
 * Deploy the Origan Landing Page as a static website
 */
export async function deployLandingPage(): Promise<LandingPageDeploymentResult> {
  // Create Garage bucket for Landing Page
  const landingBucket = await GarageBucket("origan-landing", {
    endpoint: process.env.GARAGE_ENDPOINT || "https://s3.platform.origan.dev",
    keyName: "origan-landing",
    website: true,
    indexDocument: "index.html",
    errorDocument: "404.html",
  });

  // Calculate content hash to trigger updates when files change
  const sourceDir = "../packages/landing/out";
  const contentHash = await calculateDirHash(sourceDir);
  console.log(`Landing page content hash: ${contentHash}`);

  // Deploy Landing Page files
  const landingDeployment = await GarageStaticSite("landing-deployment", {
    sourceDir,
    bucketName: landingBucket.name,
    endpoint: landingBucket.endpoint,
    accessKeyId: landingBucket.accessKeyId,
    secretAccessKey: landingBucket.secretAccessKey,
    cleanupOrphaned: true,
    contentHash, // This will trigger updates when content changes
  });

  // Create middleware for Host header rewrite in platform namespace
  const landingMiddleware = await TraefikMiddleware("origan-landing-headers", {
    namespace: "platform",
    type: "headers",
    config: {
      customRequestHeaders: {
        Host: "origan-landing",
      },
    },
  });

  // Create Ingress in platform namespace
  const landingIngress = await Ingress("origan-landing-ingress", {
    namespace: "platform",
    hostname: "hello.origan.dev",
    backend: {
      service: "garage",
      port: 3902,
    },
    tls: true,
    annotations: {
      "traefik.ingress.kubernetes.io/router.middlewares":
        landingMiddleware.reference,
    },
  });

  return {
    bucket: landingBucket,
    deployment: landingDeployment,
    middleware: landingMiddleware,
    ingress: landingIngress,
  };
}
