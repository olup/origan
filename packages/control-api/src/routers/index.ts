import { otel } from "@hono/otel";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { env } from "../config.js";
import { type Env, loggerMiddleware } from "../instrumentation.js";
import { createContext } from "../trpc/context.js";
import { appRouter } from "../trpc/router.js";
// Keep old routers for now during migration
import { authRouter } from "./auth.js";
import { buildsRouter } from "./builds.js";
import { deploymentsRouter } from "./deployments.js";
import { environmentsRouter } from "./environments.js";
import { githubRouter } from "./github.js";
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
  // Mount tRPC at /trpc
  .use(
    "/trpc/*",
    trpcServer({
      router: appRouter,
      createContext: async (_opts, c) => {
        const ctx = await createContext({ c });
        return ctx as any; // tRPC context needs to be a plain object
      },
      onError({ error, path }) {
        console.error(`Error in tRPC handler on path '${path}':`, error);
      },
    }),
  )
  // Keep old routes for gradual migration
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

// Export tRPC AppRouter type for clients
export type { AppRouter } from "../trpc/router.js";
