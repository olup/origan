import { z } from "zod";

export const deployResponseSchema = z.object({
  status: z.literal("success"),
  message: z.string(),
  projectRef: z.string(),
  version: z.string(),
});

export const deployErrorSchema = z.object({
  error: z.string(),
  details: z.string(),
});

export const getConfigResponseSchema = z.object({
  config: z.unknown(),
  deploymentId: z.string(),
});

export type DeployResponse = z.infer<typeof deployResponseSchema>;
export type DeployError = z.infer<typeof deployErrorSchema>;
export type GetConfigResponse = z.infer<typeof getConfigResponseSchema>;
