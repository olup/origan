import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { env } from "../config.js";
import type { Env } from "../instrumentation.js";
import { db } from "../libs/db/index.js";
import * as schema from "../libs/db/schema.js";
import { auth } from "../middleware/auth.js";
import {
  deploymentConfigSchema,
  deployRequestSchema,
  getConfigRequestSchema,
} from "../schemas/deploy.js";
import {
  BundleProcessingError,
  getDeployment,
  getDeploymentsByProject,
  InvalidConfigError,
  initiateDeployment,
  operateDeployment,
  ProjectNotFoundError,
  S3UploadError,
} from "../service/deployment.service.js";

export const deploymentsRouter = new Hono<Env>()
  .post(
    "/create",
    auth(),
    zValidator("form", deployRequestSchema),
    async (c) => {
      const {
        projectRef,
        bundle,
        config: configString,
        trackName,
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
      // TODO - add organization access control after deployment service is updated to support organizationId

      try {
        const initiateDeploymentResult = await initiateDeployment({
          projectRef,
          trackName,
        });

        // Operate the deployment
        await operateDeployment({
          deploymentId: initiateDeploymentResult.deployment.id,
          projectRef,
          config: configResult.data,
          bundle,
          bucketName: env.BUCKET_NAME || "deployment-bucket",
        });

        const response = {
          status: "success",
          message: "Deployment uploaded successfully",
          projectRef,
          deploymentReference: initiateDeploymentResult.deployment.reference,
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
  // Get deployment config by domain (internal route)
  // this route is not protected yet (we will need to add an internal token to the request, or remove it entirely for a more decoupled architecture)
  .post(
    "/get-config",
    zValidator("json", getConfigRequestSchema),
    async (c) => {
      const { domain } = c.req.valid("json");

      // Look up domain record by domain
      const domainRecord = await db.query.domainSchema.findFirst({
        where: eq(schema.domainSchema.name, domain),
        with: {
          deployment: true,
        },
      });

      if (
        !domainRecord ||
        !domainRecord.deployment ||
        domainRecord.deployment.status !== "success"
      ) {
        const errorResponse = {
          error: "Domain not found",
          details: "The requested domain was not found in the system",
        };
        return c.json(errorResponse, 404);
      }

      const response = {
        config: domainRecord.deployment.config,
        deploymentId: domainRecord.deployment.id,
        projectId: domainRecord.deployment.projectId,
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

      try {
        const deployment = await getDeployment({ reference: ref });
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
          status: deployment.status,
          createdAt: deployment.createdAt,
          updatedAt: deployment.updatedAt,
          project: {
            reference: deployment.project.reference,
          },
          track: deployment.track
            ? {
                name: deployment.track.name,
                id: deployment.track.id,
              }
            : null,
          build: deployment.build
            ? {
                id: deployment.build.id,
                reference: deployment.build.reference,
                commitSha: deployment.build.commitSha,
                createdAt: deployment.build.createdAt,
                updatedAt: deployment.build.updatedAt,
                buildStartedAt: deployment.build.buildStartedAt,
                buildEndedAt: deployment.build.buildEndedAt,
                logs: deployment.build.logs,
                status: deployment.build.status,
              }
            : null,
          domains: deployment.domains.map((domain) => ({
            id: domain.id,
            name: domain.name,
            // domain.name already contains the full domain with .origan.app
            url: `${env.DEPLOY_DOMAIN_PROTOCOL}${domain.name}`,
            createdAt: domain.createdAt,
            updatedAt: domain.updatedAt,
            trackId: domain.trackId,
          })),
        });
      } catch (error) {
        const errorResponse = {
          error: "Failed to fetch deployment",
          details: error instanceof Error ? error.message : String(error),
        };
        return c.json(errorResponse, 500);
      }
    },
  )
  .get(
    "/by-project-ref/:projectReference",
    auth(),
    zValidator("param", z.object({ projectReference: z.string() })),
    async (c) => {
      const { projectReference } = c.req.valid("param");
      try {
        const project = await db.query.projectSchema.findFirst({
          where: eq(schema.projectSchema.reference, projectReference),
        });

        if (!project) {
          return c.json(
            {
              error: "Project not found",
              details: `No project with reference ${projectReference}`,
            },
            404,
          );
        }

        // TODO: Implement proper authorization checks for project access
        // This should validate that the user has access to the project through
        // organization membership or other permission models

        const deployments = await getDeploymentsByProject(project.id);

        // transforming response
        return c.json(
          {
            deployments: deployments.map((deployment) => ({
              id: deployment.id,
              reference: deployment.reference,
              status: deployment.status,
              createdAt: deployment.createdAt,
              updatedAt: deployment.updatedAt,
              project: {
                reference: deployment.project.reference,
              },
              track: deployment.track
                ? {
                    name: deployment.track.name,
                    id: deployment.track.id,
                  }
                : null,
              build: deployment.build
                ? {
                    id: deployment.build.id,
                    reference: deployment.build.reference,
                    commitSha: deployment.build.commitSha,
                  }
                : null,
              domains: deployment.domains.map((domain) => ({
                id: domain.id,
                name: domain.name,
                // domain.name already contains the full domain with .origan.app
                url: `${env.DEPLOY_DOMAIN_PROTOCOL}${domain.name}`,
                createdAt: domain.createdAt,
                updatedAt: domain.updatedAt,
                trackId: domain.trackId,
              })),
            })),
          },
          200,
        );
      } catch (error) {
        const errorResponse = {
          error: "Failed to fetch deployments",
          details: error instanceof Error ? error.message : String(error),
        };
        return c.json(errorResponse, 500);
      }
    },
  );
