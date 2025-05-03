import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

export const config = z.object({
  APP_ENV: z.enum(["development", "production"]),

  DATABASE_URL: z.string(),
  BUCKET_URL: z.string(),
  BUCKET_ACCESS_KEY: z.string(),
  BUCKET_SECRET_KEY: z.string(),
  BUCKET_NAME: z.string(),
  BUCKET_REGION: z.string(),
  ORIGAN_DEPLOY_DOMAIN: z.string(),
  ORIGAN_ADMIN_PANEL_URL: z.string(),
  ORIGAN_API_URL: z.string(),

  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  GITHUB_WEBHOOK_SECRET: z.string(),

  // JWT Configuration
  JWT_SECRET: z.string(),
});

export const env = config.parse(process.env);
