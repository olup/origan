import { z } from "zod";
import { DeploymentManifestSchema } from "./manifest.js";

// TODO necessary ?
export const BuildArtifactConfigSchema = DeploymentManifestSchema;

export const BuildArtifactFormSchema = z.object({
  artifact: z.instanceof(File),
  config: z.string().transform((str) => {
    try {
      const parsed = JSON.parse(str);
      return BuildArtifactConfigSchema.parse(parsed);
    } catch {
      throw new Error("Invalid config JSON");
    }
  }),
});

export const BuildLogLevelSchema = z.enum(["info", "error", "warn", "debug"]);

export const BuildLogStreamInputSchema = z.object({
  deploymentRef: z.string(),
});

export const BuildLogStreamEventSchema = z.object({
  buildId: z.string().uuid(),
  timestamp: z.string().datetime(),
  level: BuildLogLevelSchema,
  message: z.string(),
});
