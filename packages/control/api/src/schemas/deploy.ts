import { z } from "zod";

export const routeSchema = z.object({
  urlPath: z.string(),
  functionPath: z.string(),
});

export const deploymentConfigSchema = z.object({
  app: z.array(z.string()),
  api: z.array(routeSchema),
});

export const deployParamsSchema = z.object({
  projectRef: z.string(),
  branchRef: z.string(),
  bundle: z.instanceof(File),
  config: deploymentConfigSchema,
  deploymentsRoot: z.string().optional(),
  bucketName: z.string().optional(),
});

export type DeploymentConfig = z.infer<typeof deploymentConfigSchema>;
export const getConfigRequestSchema = z.object({
  domain: z.string().min(1, "Domain is required"),
});

export type DeployParams = z.infer<typeof deployParamsSchema>;
export const deployRequestSchema = z.object({
  projectRef: z.string().min(1, "Project reference is required"),
  branchRef: z.string().default("main"),
  bundle: z.instanceof(File, { message: "Bundle file is required" }),
  config: z.string().min(1, "Config is required"),
});

export type GetConfigRequest = z.infer<typeof getConfigRequestSchema>;
export type DeployRequest = z.infer<typeof deployRequestSchema>;
