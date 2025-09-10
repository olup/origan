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

  // Deploy Admin files
  const adminDeployment = await GarageStaticSite("admin-deployment", {
    sourceDir: "../packages/admin/dist",
    bucketName: adminBucket.name,
    endpoint: adminBucket.endpoint,
    accessKeyId: adminBucket.accessKeyId,
    secretAccessKey: adminBucket.secretAccessKey,
    cleanupOrphaned: true,
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
