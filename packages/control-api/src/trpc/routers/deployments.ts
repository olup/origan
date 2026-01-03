import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../config.js";
import { getLogger } from "../../instrumentation.js";
import { db } from "../../libs/db/index.js";
import * as schema from "../../libs/db/schema.js";
import {
  deploymentConfigSchema,
  getConfigRequestSchema,
} from "../../schemas/deploy.js";
import { getProjectWithAccessCheck } from "../../service/authorization.service.js";
import {
  BundleProcessingError,
  getDeployment,
  getDeploymentsByProject,
  InvalidConfigError,
  initiateDeployment,
  operateDeployment,
  ProjectNotFoundError,
  S3UploadError,
} from "../../service/deployment.service.js";
import { protectedProcedure, publicProcedure, router } from "../init.js";

export const deploymentsRouter = router({
  // Create deployment with native FormData support
  create: protectedProcedure
    .input(z.instanceof(FormData))
    .mutation(async ({ input, ctx }) => {
      const log = getLogger();
      const formData = input;

      // Extract form fields
      const projectRef = formData.get("projectRef");
      const trackName = formData.get("trackName");
      const bundle = formData.get("bundle");
      const configString = formData.get("config");

      // Validate required fields
      if (!projectRef || typeof projectRef !== "string") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "projectRef is required",
        });
      }

      if (!bundle || !(bundle instanceof File)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "bundle file is required",
        });
      }

      if (!configString || typeof configString !== "string") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "config is required",
        });
      }

      // Parse and validate config
      let parsedConfig: unknown;
      try {
        parsedConfig = JSON.parse(configString);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid JSON in config",
          cause: error,
        });
      }

      const configResult = deploymentConfigSchema.safeParse(parsedConfig);
      if (!configResult.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid config format",
          cause: configResult.error,
        });
      }

      // Check user has access to this project
      await getProjectWithAccessCheck(ctx.userId, projectRef);

      try {
        const initiateDeploymentResult = await initiateDeployment({
          projectRef,
          trackName: typeof trackName === "string" ? trackName : undefined,
          triggerSource: "api",
        });

        // Operate the deployment
        await operateDeployment({
          deploymentId: initiateDeploymentResult.deployment.id,
          projectRef,
          config: configResult.data,
          bundle,
          bucketName: env.BUCKET_NAME || "deployment-bucket",
        });

        return {
          status: "success",
          message: "Deployment uploaded successfully",
          projectRef,
          deploymentReference: initiateDeploymentResult.deployment.reference,
          deploymentId: initiateDeploymentResult.deployment.id,
        };
      } catch (error) {
        log.withError(error).error("Deployment error");

        if (error instanceof ProjectNotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }

        if (error instanceof InvalidConfigError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        if (error instanceof BundleProcessingError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        if (error instanceof S3UploadError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to upload deployment files",
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Deployment failed",
          cause: error,
        });
      }
    }),

  // Get config for deployment preparation
  getConfig: protectedProcedure
    .input(getConfigRequestSchema)
    .query(async ({ input, ctx }) => {
      const log = getLogger();

      try {
        const project = await getProjectWithAccessCheck(
          ctx.userId,
          input.domain,
        );

        return {
          projectRef: project.reference,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        log.withError(error).error("Failed to get deployment config");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get deployment config",
        });
      }
    }),

  // Get deployment config by domain for gateway
  getConfigByDomain: publicProcedure
    .input(z.object({ domain: z.string() }))
    .query(async ({ input }) => {
      const log = getLogger();

      try {
        // Find the domain and its associated deployment
        const domain = await db.query.domainSchema.findFirst({
          where: eq(schema.domainSchema.name, input.domain),
          with: {
            deployment: true,
            project: true,
          },
        });

        if (!domain) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Domain not found",
          });
        }

        if (!domain.deployment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No deployment found for this domain",
          });
        }

        // Return the config in the format expected by the gateway
        return {
          config: domain.deployment.config || { version: 1, resources: [] },
          deploymentId: domain.deployment.id,
          projectId: domain.projectId,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        log.withError(error).error("Failed to get deployment config by domain");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get deployment config",
        });
      }
    }),

  // Get deployment by reference
  getByRef: protectedProcedure
    .input(z.object({ ref: z.string() }))
    .query(async ({ input, ctx }) => {
      const deployment = await getDeployment({ reference: input.ref });

      if (!deployment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deployment not found",
        });
      }

      // Check user has access to the project this deployment belongs to
      await getProjectWithAccessCheck(ctx.userId, deployment.project.reference);

      return deployment;
    }),

  // Get deployments by project reference
  listByProject: protectedProcedure
    .input(z.object({ projectRef: z.string() }))
    .query(async ({ input, ctx }) => {
      const project = await getProjectWithAccessCheck(
        ctx.userId,
        input.projectRef,
      );

      const deployments = await getDeploymentsByProject(project.id);

      return deployments;
    }),
});
