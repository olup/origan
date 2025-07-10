import { z } from "zod";

export const routeSchema = z.object({
  urlPath: z.string(),
  functionPath: z.string(),
});

export const deploymentConfigSchema = z.object({
  app: z.array(z.string()),
  api: z.array(routeSchema),
});

export const getConfigRequestSchema = z.object({
  domain: z.string().min(1, "Domain is required"),
});

export const deployRequestSchema = z.object({
  projectRef: z.string().min(1, "Project reference is required"),
  bundle: z.instanceof(File, { message: "Bundle file is required" }),
  config: z.string().min(1, "Config is required"),
  trackName: z.string().optional(),
});
