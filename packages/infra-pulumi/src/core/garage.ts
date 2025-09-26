import * as pulumi from "@pulumi/pulumi";
import * as path from "path";
import * as url from "url";
import { S3DirectorySync } from "./s3-directory-sync.js";
import { GarageBucket } from "./garage-bucket.js";
import * as fs from "fs";

// Get __dirname equivalent in ES modules
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Garage StatefulSet/Service removed from IaC - using existing deployment at s3.platform.origan.dev
// Use S3 resources to manage buckets declaratively
// Note: Access keys must be created manually via Garage CLI since Garage doesn't support AWS IAM

const config = new pulumi.Config("origan");

// Get Garage credentials from config (must be set manually after creating keys in Garage)
const garageAccessKey = config.requireSecret("garageAccessKey");
const garageSecretKey = config.requireSecret("garageSecretKey");

// Export values for existing Garage deployment
export const garageServiceName = "garage"; // Existing service name in platform namespace
export const garageEndpointInternal = "http://garage.platform.svc.cluster.local:3900";
export const garageEndpointExternal = "https://s3.platform.origan.dev";
export const garageAdminEndpoint = "http://garage.platform.svc.cluster.local:3903";

// Note: AWS provider was removed since we now use direct S3 client in S3DirectorySync

// Create S3 buckets using our custom GarageBucket resource
// This only uses S3 operations that Garage actually supports
export const deploymentBucket = new GarageBucket("deployment-bucket", {
  bucketName: "origan-deployments",
  endpoint: garageEndpointExternal,
  accessKey: garageAccessKey,
  secretKey: garageSecretKey,
  forceDestroy: true,
});

export const adminBucket = new GarageBucket("admin-bucket", {
  bucketName: "origan-admin",
  endpoint: garageEndpointExternal,
  accessKey: garageAccessKey,
  secretKey: garageSecretKey,
  forceDestroy: true,
});

export const landingBucket = new GarageBucket("landing-bucket", {
  bucketName: "origan-landing",
  endpoint: garageEndpointExternal,
  accessKey: garageAccessKey,
  secretKey: garageSecretKey,
  forceDestroy: true,
});

export const logsBucket = new GarageBucket("logs-bucket", {
  bucketName: "origan-logs",
  endpoint: garageEndpointExternal,
  accessKey: garageAccessKey,
  secretKey: garageSecretKey,
  forceDestroy: true,
});

// Note: IAM resources removed - Garage doesn't support AWS IAM
// Access keys must be created manually using Garage CLI:
// 1. kubectl exec -n platform deployment/garage -- /garage key create <keyname>
// 2. kubectl exec -n platform deployment/garage -- /garage key info <keyname> --show-secret
// 3. kubectl exec -n platform deployment/garage -- /garage bucket allow --read --write --owner <bucket> --key <keyid>
// 4. Set credentials in Pulumi config:
//    pulumi config set --secret garageAccessKey <key_id>
//    pulumi config set --secret garageSecretKey <secret_key>

// Export bucket names
export const deploymentBucketName = deploymentBucket.bucket;
export const adminBucketName = adminBucket.bucket;
export const landingBucketName = landingBucket.bucket;
export const logsBucketName = logsBucket.bucket;

// Export access credentials (from config, set manually after creating keys in Garage)
export const garageAccessKeyValue = garageAccessKey;
export const garageSecretKeyValue = garageSecretKey;

// Sync static website content to buckets
// These paths are relative to the infra-pulumi package directory
const adminBuildPath = path.resolve(__dirname, "../../../admin/dist");
const landingBuildPath = path.resolve(__dirname, "../../../landing/out");



console.log()

// Create sync resources as component resources
export const adminSync = fs.existsSync(adminBuildPath) 
  ? new S3DirectorySync(
      "admin-sync",
      {
        sourceDir: adminBuildPath,
        bucketName: adminBucket.bucket,
        endpoint: garageEndpointExternal,
        accessKey: garageAccessKey,
        secretKey: garageSecretKey,
        region: "garage",
      },
      { dependsOn: [adminBucket] }
    )
  : undefined;

export const landingSync = fs.existsSync(landingBuildPath)
  ? new S3DirectorySync(
      "landing-sync", 
      {
        sourceDir: landingBuildPath,
        bucketName: landingBucket.bucket,
        endpoint: garageEndpointExternal,
        accessKey: garageAccessKey,
        secretKey: garageSecretKey,
        region: "garage",
      },
      { dependsOn: [landingBucket] }
    )
  : undefined;

// Log warnings if build directories don't exist
if (!fs.existsSync(adminBuildPath)) {
  pulumi.log.warn(`Admin build directory not found at: ${adminBuildPath}. Run 'npm run build' in the admin package first.`);
} else {
  pulumi.log.info(`Admin panel content will be synced from: ${adminBuildPath}`);
}

if (!fs.existsSync(landingBuildPath)) {
  pulumi.log.warn(`Landing build directory not found at: ${landingBuildPath}. Run 'npm run build' in the landing package first.`);
} else {
  pulumi.log.info(`Landing page content will be synced from: ${landingBuildPath}`);
}
