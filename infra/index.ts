import * as pulumi from "@pulumi/pulumi";
import * as scaleway from "@pulumiverse/scaleway";
const bucket = new scaleway.object.Bucket("my-bucket");

// Export the name of the bucket.
export const bucketName = bucket.id;
