import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

export const config = z
  .object({
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
    BUILD_RUNNER_IMAGE: z.string(),

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
  })
  // derived values
  .transform((env) => ({
    ...env,
    DEPLOY_DOMAIN_PROTOCOL:
      env.APP_ENV === "production" ? "https://" : "http://",
  }))
  // custom validation rules
  .superRefine(({ APP_ENV, AXIOM_TOKEN, AXIOM_DATASET }, refinementContext) => {
    if (APP_ENV === "production") {
      if (AXIOM_TOKEN == null) {
        refinementContext.addIssue({
          code: z.ZodIssueCode.invalid_type,
          path: ["AXIOM_TOKEN"],
          expected: "string",
          received: typeof AXIOM_TOKEN,
        });
      }
      if (AXIOM_DATASET == null) {
        refinementContext.addIssue({
          code: z.ZodIssueCode.invalid_type,
          path: ["AXIOM_DATASET"],
          expected: "string",
          received: typeof AXIOM_DATASET,
        });
      }
    }
  });

export const env = config.parse(process.env);
