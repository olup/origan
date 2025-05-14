import { z } from "zod";

// Define the environment variables schema with Zod
export const BuildRunnerEnvSchema = z.object({
  // Required environment variables
  BUILD_ID: z.string().uuid(),
  GITHUB_TOKEN: z.string(),
  REPO_FULL_NAME: z.string(),
  COMMIT_SHA: z.string(),
  BRANCH: z.string(),

  // NATS configuration
  EVENTS_NATS_SERVER: z.string().url(),

  // Optional environment variables
  EVENTS_NATS_NKEY_CREDS: z.string().optional().default(""),
});

// Parse and validate the environment variables
export function getConfig() {
  try {
    return BuildRunnerEnvSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Invalid build runner environment variables:");
      for (const err of error.errors) {
        console.error(`- ${err.path.join(".")}: ${err.message}`);
      }
    } else {
      console.error("Error parsing environment variables:", error);
    }
    process.exit(1);
  }
}
