import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../instrumentation.js";
import { db } from "../libs/db/index.js";
import * as schema from "../libs/db/schema.js";
import { auth } from "../middleware/auth.js";
import {
  deployRequestSchema,
  deploymentConfigSchema,
  getConfigRequestSchema,
} from "../schemas/deploy.js";
import {
  BundleProcessingError,
  InvalidConfigError,
  ProjectNotFoundError,
  S3UploadError,
  deploy,
  getDeployment,
} from "../service/deployment.service.js";

export const deploymentsRouter = new Hono<Env>()
  .post(
    "/create",
    auth(),
    zValidator("form", deployRequestSchema),
    async (c) => {
      const {
        projectRef,
        branchRef,
        bundle,
        config: configString,
      } = c.req.valid("form");

      // Parse and validate config
      let parsedConfig: unknown;
      try {
        parsedConfig = JSON.parse(configString);
      } catch (error) {
        const errorResponse = {
          error: "Invalid JSON in config",
          details: error instanceof Error ? error.message : String(error),
        };
        return c.json(errorResponse, 400);
      }

      const configResult = deploymentConfigSchema.safeParse(parsedConfig);
      if (!configResult.success) {
        const errorResponse = {
          error: "Invalid config format",
          details: configResult.error.message,
        };
        return c.json(errorResponse, 400);
      }

      // TODO - check user permissions
      try {
        const result = await deploy({
          projectRef,
          branchRef,
          bundle,
          config: configResult.data,
        });

        const response = {
          status: "success",
          message: "Deployment uploaded successfully",
          projectRef: result.projectRef,
          deploymentId: result.deploymentId,
          urls: result.urls,
        };
        return c.json(response);
      } catch (error) {
        c.var.log.withError(error).error("Deployment error");

        if (error instanceof ProjectNotFoundError) {
          return c.json(
            { error: "Project Not Found", details: error.message },
            404,
          );
        }

        if (error instanceof InvalidConfigError) {
          return c.json(
            { error: "Invalid Configuration", details: error.message },
            400,
          );
        }

        if (
          error instanceof BundleProcessingError ||
          error instanceof S3UploadError
        ) {
          return c.json(
            { error: "Deployment Processing Failed", details: error.message },
            500,
          );
        }

        // Fallback for unexpected errors
        return c.json(
          {
            error: "Internal Server Error",
            details:
              error instanceof Error
                ? error.message
                : "An unknown error occurred",
          },
          500,
        );
      }
    },
  )
  // Get deployment config by domain
  // this route is not protected yet (we will need to add an internal token to the request, or remove it entirely for a more decoupled architecture)
  .post(
    "/get-config",
    zValidator("json", getConfigRequestSchema),
    async (c) => {
      const { domain } = c.req.valid("json");

      // Look up host record by domain
      const host = await db.query.hostSchema.findFirst({
        where: eq(schema.hostSchema.name, domain),
        with: {
          deployment: true,
        },
      });

      if (!host || !host.deployment) {
        const errorResponse = {
          error: "Domain not found",
          details: "The requested domain was not found in the system",
        };
        return c.json(errorResponse, 404);
      }

      const response = {
        config: host.deployment.config,
        deploymentId: host.deployment.id,
        projectId: host.deployment.projectId,
      };
      return c.json(response);
    },
  )
  .get(
    "/by-ref/:ref",
    auth(),
    zValidator("param", z.object({ ref: z.string() })),
    async (c) => {
      const { ref } = c.req.valid("param");
      const userId = c.get("userId");

      try {
        const deployment = await getDeployment({ userId, reference: ref });
        if (!deployment) {
          const errorResponse = {
            error: "Deployment not found",
            details: `No deployment found with reference ${ref}`,
          };
          return c.json(errorResponse, 404);
        }
        return c.json({
          id: deployment.id,
          reference: deployment.reference,
          createdAt: deployment.createdAt,
          projectId: deployment.projectId,
        });
      } catch (error) {
        const errorResponse = {
          error: "Failed to fetch deployment",
          details: error instanceof Error ? error.message : String(error),
        };
        return c.json(errorResponse, 500);
      }
    },
  );
