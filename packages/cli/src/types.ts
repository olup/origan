import { z } from "zod";

/**
 * Origan configuration schema
 */
export const origanConfigSchema = z.object({
  /** Config schema version */
  version: z.literal(1),
  /** Directory containing built app files */
  appDir: z.string(),
  /** Optional directory containing serverless API functions */
  apiDir: z.string().optional(),
  /** Reference to the project in the Origan control panel */
  projectRef: z.string(),
});

/**
 * Origan configuration type derived from schema
 */
export type OriganConfig = z.infer<typeof origanConfigSchema>;
