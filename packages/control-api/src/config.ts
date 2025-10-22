import { z } from "zod";

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
  BUILDER_IMAGE: z.string(),

  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  GITHUB_WEBHOOK_SECRET: z.string(),
  GITHUB_APP_ID: z.string(),
  GITHUB_APP_PRIVATE_KEY_BASE64: z.string(),

  // Security Configuration
  JWT_SECRET: z.string(),

  EVENTS_NATS_SERVER: z.string(),
  EVENTS_NATS_NKEY_CREDS: z.string().optional(),

  // Axiom Token
  AXIOM_TOKEN: z.string().optional(),
  AXIOM_DATASET: z.string().optional(),

  // ACME/SSL Configuration
  ACME_ACCOUNT_KEY: z.string().optional(),
  ACME_SERVER_URL: z.string().optional(),
  ACME_SKIP_TLS_VERIFY: z
    .string()
    .optional()
    .transform((val) => val === "true"),
});

export const env = config.parse(process.env);
