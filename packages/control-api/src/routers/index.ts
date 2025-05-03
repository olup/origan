import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "../config.js";
import { authRouter } from "./auth.js";
import { deploymentsRouter } from "./deployments.js";
import { githubRouter } from "./github.js"; // Import the new GitHub router
import { projectsRouter } from "./projects.js";

// Create main router with middleware
const api = new Hono()
  .use(logger())
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
  .route("/github", githubRouter);

export default api;

export type ApiType = typeof api;
