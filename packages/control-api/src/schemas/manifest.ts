import { z } from "zod";

export const ManifestResourceSchema = z.object({
  kind: z.enum(["static", "dynamic"]),
  urlPath: z.string(),
  resourcePath: z.string(),
  methods: z.array(z.string()).optional(),
  headers: z.record(z.string()).optional(),
  wildcard: z.boolean().optional(),
});

export const DeploymentManifestSchema = z.object({
  version: z.number().int(),
  resources: z.array(ManifestResourceSchema),
});

export type DeploymentManifest = z.infer<typeof DeploymentManifestSchema>;
