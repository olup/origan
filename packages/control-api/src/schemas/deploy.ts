import { z } from "zod";
import { DeploymentManifestSchema } from "./manifest.js";

export const deploymentConfigSchema = DeploymentManifestSchema;

export const getConfigRequestSchema = z.object({
  domain: z.string().min(1, "Domain is required"),
});

export const deployRequestSchema = z.object({
  projectRef: z.string().min(1, "Project reference is required"),
  bundle: z.instanceof(File, { message: "Bundle file is required" }),
  config: z.string().min(1, "Config is required"),
  trackName: z.string().optional(),
});
