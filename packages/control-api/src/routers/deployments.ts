import { console } from "node:inspector";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../libs/db/index.js";
import * as schema from "../libs/db/schema.js";
import {
  deployRequestSchema,
  deploymentConfigSchema,
  getConfigRequestSchema,
} from "../schemas/deploy.js";
import { deploy } from "../service/deploy.service.js";

// Deploy router
export const deploymentsRouter = new Hono()
  .post("/create", zValidator("form", deployRequestSchema), async (c) => {
    const {
      projectRef,
      branchRef,
      bundle,
      config: configString,
    } = c.req.valid("form");

    console.log("Received deployment request");
    console.log("Project Ref:", projectRef);
    console.log("Branch Ref:", branchRef);

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
      console.log(parsedConfig);
      console.warn("Invalid config format");
      const errorResponse = {
        error: "Invalid config format",
        details: configResult.error.message,
      };
      return c.json(errorResponse, 400);
    }

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
      const errorResponse = {
        error: "Failed to process deployment",
        details: error instanceof Error ? error.message : String(error),
      };
      return c.json(errorResponse, 500);
    }
  })
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
      };
      return c.json(response);
    },
  );
