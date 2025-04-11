import { z } from "zod";

const envSchema = z.object({
  origanDeployDomain: z.string().min(1, "ORIGAN_DEPLOY_DOMAIN is required"),
  runnerUrl: z.string().min(1, "RUNNER_URL is required"),
  bucketName: z.string().default("deployment-bucket"),
  bucketUrl: z.string().min(1, "BUCKET_URL is required"),
  bucketRegion: z.string().default("us-east-1"),
  bucketAccessKey: z.string().min(1, "BUCKET_ACCESS_KEY is required"),
  bucketSecretKey: z.string().min(1, "BUCKET_SECRET_KEY is required"),

  hasTlsServer: z
    .string()
    .default("false")
    .transform((val) => val.toLowerCase() === "true"),
  tlsCertFile: z.string(),
  tlsKeyFile: z.string(),
});

const parsed = envSchema.safeParse({
  origanDeployDomain: process.env.ORIGAN_DEPLOY_DOMAIN,
  runnerUrl: process.env.RUNNER_URL,
  bucketName: process.env.BUCKET_NAME,
  bucketUrl: process.env.BUCKET_URL,
  bucketRegion: process.env.BUCKET_REGION,
  bucketAccessKey: process.env.BUCKET_ACCESS_KEY,
  bucketSecretKey: process.env.BUCKET_SECRET_KEY,
  tlsCertFile: process.env.TLS_CERT_FILE,
  tlsKeyFile: process.env.TLS_KEY_FILE,
  hasTlsServer: process.env.HAS_TLS_SERVER,
});

if (!parsed.success) {
  console.error(
    "❌ Invalid environment variables:",
    parsed.error.flatten().fieldErrors,
  );
  throw new Error("Invalid environment variables");
}

export const envConfig = parsed.data;
