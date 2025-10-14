import * as pulumi from "@pulumi/pulumi";
import { GarageBucket } from "./garage-bucket.js";

// Garage StatefulSet/Service removed from IaC - using existing deployment at s3.platform.origan.dev
// Use S3 resources to manage buckets declaratively
// Note: Access keys must be created manually via Garage CLI since Garage doesn't support AWS IAM

const config = new pulumi.Config("origan");

// Get Garage credentials from config (must be set manually after creating keys in Garage)
const garageAccessKey = config.requireSecret("garageAccessKey");
const garageSecretKey = config.requireSecret("garageSecretKey");

// Export values for existing Garage deployment
export const garageServiceName = "garage"; // Existing service name in platform namespace
export const garageEndpointInternal =
  "http://garage.platform.svc.cluster.local:3900";
export const garageEndpointExternal = "https://s3.platform.origan.dev";
export const garageAdminEndpoint =
  "http://garage.platform.svc.cluster.local:3903";

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
export const logsBucketName = logsBucket.bucket;

// Export access credentials (from config, set manually after creating keys in Garage)
export const garageAccessKeyValue = garageAccessKey;
export const garageSecretKeyValue = garageSecretKey;
