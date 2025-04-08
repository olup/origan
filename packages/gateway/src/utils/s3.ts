import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "process";
import { envConfig } from "../config/index.js";

// Initialize S3 client
export const s3Client = new S3Client({
  endpoint: envConfig.bucketUrl,
  region: envConfig.bucketRegion || "us-east-1", // Use configured region or default to MinIO's default
  forcePathStyle: envConfig.bucketUrl?.includes("minio") || false, // Required for MinIO
  credentials: {
    accessKeyId: envConfig.bucketAccessKey || "",
    secretAccessKey: envConfig.bucketSecretKey || "",
  },
});

// Function to fetch file from S3
export async function fetchFromS3(key: string) {
  try {
    const command = new GetObjectCommand({
      Bucket: envConfig.bucketName,
      Key: key,
    });

    const response = await s3Client.send(command);
    if (!response.Body) {
      throw new Error("No response body");
    }

    // Convert Readable to Buffer
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    console.error("Error fetching file from S3:", error);
    return null;
  }
}
