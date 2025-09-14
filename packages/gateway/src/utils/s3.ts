import type { Readable } from "node:stream";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { envConfig } from "../config/index.js";

// Initialize S3 client
export const s3Client = new S3Client({
  endpoint: envConfig.bucketUrl,
  region: envConfig.bucketRegion || "us-east-1", // Use configured region or default to MinIO's default
  forcePathStyle: true, // Required for MinIO/Garage - use path-style URLs
  credentials: {
    accessKeyId: envConfig.bucketAccessKey || "",
    secretAccessKey: envConfig.bucketSecretKey || "",
  },
});

// Function to stream file from S3
export async function streamFromS3(key: string) {
  try {
    const command = new GetObjectCommand({
      Bucket: envConfig.bucketName,
      Key: key,
    });

    const response = await s3Client.send(command);
    if (!response.Body) {
      return null;
    }

    return {
      stream: response.Body as Readable,
      contentLength: response.ContentLength,
      contentType: response.ContentType,
      etag: response.ETag,
      lastModified: response.LastModified,
    };
  } catch (error) {
    console.error("Error streaming file from S3:", error);
    return null;
  }
}
