import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  BUCKET_ACCESS_KEY,
  BUCKET_NAME,
  BUCKET_REGION,
  BUCKET_SECRET_KEY,
  BUCKET_URL,
} from "../config/env.js";

// Initialize S3 client
export const s3Client = new S3Client({
  endpoint: BUCKET_URL,
  region: BUCKET_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: BUCKET_ACCESS_KEY || "",
    secretAccessKey: BUCKET_SECRET_KEY || "",
  },
});

// Function to fetch file from S3
export async function fetchFromS3(key: string) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
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
