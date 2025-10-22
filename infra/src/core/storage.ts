import { garageEndpoint, resourceName } from "../config.js";

// TODO: Fix AWS provider smithy error, then uncomment
// Create deployment bucket
// export const deploymentBucket = new aws.s3.Bucket("deployment-bucket", {
//   bucket: resourceName("origan-deployments"),
//   forceDestroy: true, // Allow destruction even if not empty (be careful in prod!)
// }, { provider: garageProvider });

// // Create admin panel bucket
// export const adminBucket = new aws.s3.Bucket("admin-bucket", {
//   bucket: resourceName("origan-admin"),
//   forceDestroy: true,
// }, { provider: garageProvider });

// // Create landing page bucket
// export const landingBucket = new aws.s3.Bucket("landing-bucket", {
//   bucket: resourceName("origan-landing"),
//   forceDestroy: true,
// }, { provider: garageProvider });

// // Bucket policies for public access (for static sites)
// const adminBucketPolicy = new aws.s3.BucketPolicy("admin-bucket-policy", {
//   bucket: adminBucket.bucket,
//   policy: adminBucket.bucket.apply(bucketName => JSON.stringify({
//     Version: "2012-10-17",
//     Statement: [{
//       Sid: "PublicReadGetObject",
//       Effect: "Allow",
//       Principal: "*",
//       Action: ["s3:GetObject"],
//       Resource: [`arn:aws:s3:::${bucketName}/*`],
//     }],
//   })),
// }, { provider: garageProvider });

// const landingBucketPolicy = new aws.s3.BucketPolicy("landing-bucket-policy", {
//   bucket: landingBucket.bucket,
//   policy: landingBucket.bucket.apply(bucketName => JSON.stringify({
//     Version: "2012-10-17",
//     Statement: [{
//       Sid: "PublicReadGetObject",
//       Effect: "Allow",
//       Principal: "*",
//       Action: ["s3:GetObject"],
//       Resource: [`arn:aws:s3:::${bucketName}/*`],
//     }],
//   })),
// }, { provider: garageProvider });

// For now, use existing bucket names
export const deploymentBucketName = resourceName("origan-deployments");
export const adminBucketName = resourceName("origan-admin");
export const landingBucketName = resourceName("origan-landing");

// For internal cluster access (if Garage is in the cluster)
export const internalGarageEndpoint =
  "http://garage.garage.svc.cluster.local:3900";
// For external access
export const externalGarageEndpoint = garageEndpoint;
