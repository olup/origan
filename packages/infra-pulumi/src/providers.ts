import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import * as docker from "@pulumi/docker";
import * as aws from "@pulumi/aws";
import { garageEndpoint, garageAccessKey, garageSecretKey, registryEndpoint, kubeconfig } from "./config.js";

// Kubernetes provider
export const k8sProvider = new kubernetes.Provider("k8s", {
  kubeconfig: kubeconfig,
});

// Docker provider for building and pushing images
export const dockerProvider = new docker.Provider("docker", {
  registryAuth: [{
    address: registryEndpoint,
    // Add username/password if your registry requires auth
    // username: process.env.REGISTRY_USERNAME,
    // password: process.env.REGISTRY_PASSWORD,
  }],
});

// AWS provider configured for Garage (S3-compatible)
// TODO: Fix smithy error
// export const garageProvider = new aws.Provider("garage", {
//   endpoints: [{
//     s3: garageEndpoint,
//   }],
//   accessKey: garageAccessKey?.apply(key => key || process.env.GARAGE_ACCESS_KEY || ""),
//   secretKey: garageSecretKey?.apply(key => key || process.env.GARAGE_SECRET_KEY || ""),
//   region: "us-east-1", // Garage doesn't care about region
//   s3UsePathStyle: true, // Required for S3-compatible services
//   skipCredentialsValidation: true,
//   skipRequestingAccountId: true,
//   skipMetadataApiCheck: true,
// });

// Temporary placeholder
export const garageProvider = null;