import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { BuildArtifactConfigSchema } from "../../schemas/build.js";
import { deployBuild } from "../../service/build/deploy.js";
import { publicProcedure, router } from "../init.js";

type BuildArtifactConfig = z.infer<typeof BuildArtifactConfigSchema>;

export const buildsRouter = router({
  deploy: publicProcedure
    .input(z.instanceof(FormData))
    .mutation(async ({ input, ctx }) => {
      // Extract token from context or form
      const token = ctx.honoCtx.req
        .header("Authorization")
        ?.replace("Bearer ", "");

      if (!token) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Missing deploy token",
        });
      }

      const formData = input;
      const buildId = formData.get("buildId");
      const artifact = formData.get("artifact");
      const config = formData.get("config");

      if (!buildId || typeof buildId !== "string") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "buildId is required",
        });
      }

      if (!artifact || !(artifact instanceof File)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "artifact file is required",
        });
      }

      if (!config || typeof config !== "string") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "config is required",
        });
      }

      // Parse and validate config
      let parsedConfig: BuildArtifactConfig;
      try {
        const configJson = JSON.parse(config);
        parsedConfig = BuildArtifactConfigSchema.parse(configJson);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid config format",
          cause: error,
        });
      }

      try {
        await deployBuild(buildId, artifact, parsedConfig, token);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to process build artifact",
          cause: error,
        });
      }
    }),
});
