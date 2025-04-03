import { serve } from "@hono/node-server";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { db_url as dbUrl } from "./config.js";
import * as schema from "./schema.js";
import {
  deployRequestSchema,
  deploymentConfigSchema,
  getConfigRequestSchema,
} from "./schemas/deploy.js";
import type {
  DeployError,
  DeployResponse,
  GetConfigResponse,
} from "./schemas/responses.js";
import { deploy } from "./service/deploy.service.js";

const db = drizzle({ connection: dbUrl, schema: schema });

const api = new Hono()
  .post("/deploy", async (c) => {
    // Validate request
    const requestResult = deployRequestSchema.safeParse(
      await c.req.parseBody(),
    );
    if (!requestResult.success) {
      const errorResponse: DeployError = {
        error: "Invalid request format",
        details: requestResult.error.message,
      };
      return c.json(errorResponse, 400);
    }

    const {
      projectRef,
      branchRef,
      bundle,
      config: configString,
    } = requestResult.data;

    console.log("Received deployment request");
    console.log("Project Ref:", projectRef);
    console.log("Branch Ref:", branchRef);

    // Parse and validate config
    let parsedConfig: unknown;
    try {
      parsedConfig = JSON.parse(configString);
    } catch (error) {
      const errorResponse: DeployError = {
        error: "Invalid JSON in config",
        details: error instanceof Error ? error.message : String(error),
      };
      return c.json(errorResponse, 400);
    }

    const configResult = deploymentConfigSchema.safeParse(parsedConfig);
    if (!configResult.success) {
      console.log(parsedConfig);
      console.warn("Invalid config format");
      const errorResponse: DeployError = {
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

      const response: DeployResponse = {
        status: "success",
        message: "Deployment uploaded successfully",
        projectRef: result.projectRef,
        version: result.deploymentId,
      };
      return c.json(response);
    } catch (error) {
      const errorResponse: DeployError = {
        error: "Failed to process deployment",
        details: error instanceof Error ? error.message : String(error),
      };
      return c.json(errorResponse, 500);
    }
  })
  .post("/getConfig", async (c) => {
    const body = await c.req.json();

    const parseResult = getConfigRequestSchema.safeParse(body);
    if (!parseResult.success) {
      const errorResponse: DeployError = {
        error: "Invalid request format",
        details: parseResult.error.message,
      };
      return c.json(errorResponse, 400);
    }

    const { domain } = parseResult.data;

    // Look up host record by domain
    const host = await db.query.hostSchema.findFirst({
      where: eq(schema.hostSchema.name, domain),
      with: {
        deployment: true,
      },
    });

    if (!host || !host.deployment) {
      const errorResponse: DeployError = {
        error: "Domain not found",
        details: "The requested domain was not found in the system",
      };
      return c.json(errorResponse, 404);
    }

    const response: GetConfigResponse = {
      config: host.deployment.config,
      deploymentId: host.deployment.id,
    };
    return c.json(response);
  });

const root = new Hono()
  .use(logger())
  .use(cors({ origin: process.env.CORS_ORIGIN || "" }))
  .get("/.healthz", (c) => c.json({ message: "OK" }))
  .route("/api/", api);

export type ApiType = typeof root;

const port = Number.parseInt(process.env.PORT ?? "9999");
console.log(`Starting API server on port ${port}`);

serve({
  fetch: root.fetch,
  port: port,
});
