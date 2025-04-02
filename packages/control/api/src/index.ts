import { serve } from "@hono/node-server";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { db_url as dbUrl } from "./config.js";
import * as schema from "./schema.js";
import { counterSchema } from "./schema.js";
import { deploy, validateConfig } from "./service/deploy.service.js";

const db = drizzle({ connection: dbUrl, schema: schema });

await db
  .insert(counterSchema)
  .values({ id: 1, counter: 0 })
  .onConflictDoNothing();

const api = new Hono()
  .get("/hello", (c) => c.json({ message: "Hello" }))
  .get("/counter", async (c) => {
    const counterValue = await db.query.counterSchema.findFirst({
      where: eq(counterSchema.id, 1),
    });
    return c.json({
      counter: counterValue?.counter,
    });
  })
  .post("/counter", async (c) => {
    const counters = await db
      .update(counterSchema)
      .set({
        counter: sql`${counterSchema.counter} + 1`,
      })
      .where(eq(counterSchema.id, 1))
      .returning({ counter: counterSchema.counter });
    return c.json({ counter: counters[0].counter });
  })
  .post("/deploy", async (c) => {
    const formData = await c.req.parseBody();
    const bundle = formData.bundle;
    const projectRef = String(formData.projectRef || "");
    const branchRef = String(formData.branchRef || "main");
    const configString = String(formData.config || "");

    if (!projectRef) {
      return c.json({ error: "Project reference is required" }, 400);
    }

    if (!bundle || !(bundle instanceof File)) {
      return c.json({ error: "Bundle file is required" }, 400);
    }

    if (!configString) {
      return c.json({ error: "Config is required" }, 400);
    }

    let config: unknown;
    try {
      config = JSON.parse(configString);
    } catch (error) {
      return c.json(
        {
          error: "Invalid JSON in config",
          details: error instanceof Error ? error.message : String(error),
        },
        400
      );
    }

    if (!validateConfig(config)) {
      return c.json(
        {
          error: "Invalid config format",
          details: "Config must contain app and routes arrays",
        },
        400
      );
    }

    try {
      const result = await deploy({
        projectRef,
        branchRef,
        bundle,
        config,
      });

      return c.json({
        status: "success",
        message: "Deployment uploaded successfully",
        projectRef: result.projectRef,
        version: result.deploymentId,
      });
    } catch (error) {
      return c.json(
        {
          error: "Failed to process deployment",
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  })
  .post("/getConfig", async (c) => {
    const body = await c.req.json();
    const domain = body.domain;

    if (!domain || typeof domain !== "string") {
      return c.json({ error: "Domain is required" }, 400);
    }

    // Look up host record by domain
    const host = await db.query.hostSchema.findFirst({
      where: eq(schema.hostSchema.name, domain),
      with: {
        deployment: true,
      },
    });

    if (!host || !host.deployment) {
      return c.json({ error: "Domain not found" }, 404);
    }

    return c.json({
      config: host.deployment.config,
      deploymentId: host.deployment.id,
    });
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
