import { EventEmitter, on } from "node:events";
import { NatsClient } from "@origan/nats";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "../../config.js";
import {
  BuildArtifactConfigSchema,
  BuildLogStreamEventSchema,
  BuildLogStreamInputSchema,
} from "../../schemas/build.js";
import { assertProjectAccess } from "../../service/authorization.service.js";
import { deployBuild } from "../../service/build/deploy.js";
import { getDeployment } from "../../service/deployment.service.js";
import { protectedProcedure, publicProcedure, router } from "../init.js";

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
  streamLogs: protectedProcedure
    .input(BuildLogStreamInputSchema)
    .subscription(async function* ({ input, signal, ctx }) {
      const deployment = await getDeployment({
        reference: input.deploymentRef,
      });

      if (!deployment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deployment not found",
        });
      }

      if (!deployment.build) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Build not found",
        });
      }

      await assertProjectAccess(ctx.userId, deployment.projectId);

      let nc: NatsClient | null = null;

      try {
        nc = new NatsClient({
          server: env.EVENTS_NATS_SERVER,
          nkeyCreds: env.EVENTS_NATS_NKEY_CREDS,
        });

        await nc.connect();

        const emitter = new EventEmitter();
        const buildId = deployment.build.id;

        const subscription = await nc.subscriber.onBuildLog(async (log) => {
          const logEvent = BuildLogStreamEventSchema.parse({
            buildId,
            timestamp: log.timestamp,
            level: log.level,
            message: log.message,
          });

          emitter.emit("log", logEvent);
        }, buildId);

        const logIterator = on(emitter, "log");

        try {
          for await (const [logEvent] of logIterator) {
            if (signal?.aborted) break;
            yield logEvent;
          }
        } finally {
          subscription.unsubscribe();
        }
      } catch (error) {
        console.error("Error in build log subscription:", error);
        throw error;
      } finally {
        if (nc) {
          try {
            await nc.disconnect();
          } catch (error) {
            console.error("Error disconnecting from NATS:", error);
          }
        }
      }
    }),
});
