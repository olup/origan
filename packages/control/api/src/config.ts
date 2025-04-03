import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

export const config = z.object({
  DATABASE_URL: z.string(),
  BUCKET_URL: z.string(),
  BUCKET_ACCESS_KEY: z.string(),
  BUCKET_SECRET_KEY: z.string(),
  BUCKET_NAME: z.string(),
  BUCKET_REGION: z.string(),
  // BUCKET_NAME: z.string(),
});

type Env = z.infer<typeof config>;
export const env = config.parse(process.env);
export const db_url = env.DATABASE_URL;

// Export bucket configuration
export const bucket_config = {
  url: env.BUCKET_URL,
  accessKey: env.BUCKET_ACCESS_KEY,
  secretKey: env.BUCKET_SECRET_KEY,
  name: env.BUCKET_NAME,
  region: env.BUCKET_REGION,
};
