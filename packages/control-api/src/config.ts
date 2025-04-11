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
  ORIGAN_DEPLOY_DOMAIN: z.string(),
});

export const env = config.parse(process.env);
