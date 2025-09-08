import { otel } from "@hono/otel";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { env } from "../config.js";
import { type Env, loggerMiddleware } from "../instrumentation.js";
import { authRouter } from "./auth.js";
import { buildsRouter } from "./builds.js";
import { deploymentsRouter } from "./deployments.js";
import { environmentsRouter } from "./environments.js";
import { githubRouter } from "./github.js"; // Import the new GitHub router
import { logsRouter } from "./logs.js";
import { organizationRouter } from "./organization.js";
import { projectsRouter } from "./projects.js";

// Create main router with middleware
const api = new Hono<Env>()
  .use(requestId())
  .use(otel())
  .use(loggerMiddleware)
  .use(
    cors({
      origin: [env.ORIGAN_ADMIN_PANEL_URL],
      credentials: true,
    }),
  )
  .get("/.healthz", (c) => c.json({ message: "OK" }))
  .route("/auth", authRouter)
  .route("/projects", projectsRouter)
  .route("/deployments", deploymentsRouter)
  .route("/environments", environmentsRouter)
  .route("/github", githubRouter)
  .route("/logs", logsRouter)
  .route("/builds", buildsRouter)
  .route("/organization", organizationRouter);

export default api;

export type ApiType = typeof api;
