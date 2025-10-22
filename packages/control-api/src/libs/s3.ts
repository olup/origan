import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "../config.js";
import { getLogger } from "../instrumentation.js";

export const s3Client = new S3Client({
  endpoint: env.BUCKET_URL,
  region: env.BUCKET_REGION || "us-east-1", // Use configured region or default to MinIO's default
  forcePathStyle: true, // Required for MinIO/Garage - use path-style URLs instead of virtual-hosted-style
  credentials: {
    accessKeyId: env.BUCKET_ACCESS_KEY || "",
    secretAccessKey: env.BUCKET_SECRET_KEY || "",
  },
});

export async function getObjectBuffer(
  Bucket: string,
  Key: string,
): Promise<Uint8Array> {
  const log = getLogger();
  log.info(`Fetching ${Key} from S3 bucket ${Bucket}`);

  const getObjectCommand = new GetObjectCommand({ Bucket, Key });
  const response = await s3Client.send(getObjectCommand);

  if (!response.Body) {
    throw new Error("Empty response from S3");
  }

  // Convert to ArrayBuffer and then to string
  const body = response.Body as unknown as {
    transformToByteArray(): Promise<Uint8Array>;
  };
  return body.transformToByteArray();
}

export const putObject = async (
  Bucket: string,
  Key: string,
  Body: Uint8Array,
  ContentType: string,
): Promise<void> => {
  const log = getLogger();
  log.info(`Uploading ${Key} to S3 bucket ${Bucket}`);

  const putObjectCommand = new PutObjectCommand({
    Bucket,
    Key,
    Body,
    ContentType,
  });

  await s3Client.send(putObjectCommand);
};
