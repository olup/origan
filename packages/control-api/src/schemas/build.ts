import { z } from "zod";

// TODO necessary ?
const BuildArtifactConfigSchema = z.object({
  app: z.array(z.string()),
  api: z.array(
    z.object({
      urlPath: z.string(),
      functionPath: z.string(),
    }),
  ),
});

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
