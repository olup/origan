import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { deploymentsRouter } from "./deployments.js";
import { projectsRouter } from "./projects.js";

// Create main router with middleware
const api = new Hono()
  .use(logger())
  .use(cors({ origin: process.env.CORS_ORIGIN || "" }))
  .get("/.healthz", (c) => c.json({ message: "OK" }))
  .route("/projects", projectsRouter)
  .route("/deployments", deploymentsRouter);

export default api;

export type ApiType = typeof api;
