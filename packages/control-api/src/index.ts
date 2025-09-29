import { serve } from "@hono/node-server";
import { otel } from "@hono/otel";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { env } from "./config.js";
import { getLogger, loggerMiddleware } from "./instrumentation.js";
import { authRouter } from "./routers/auth.js";
import { githubRouter } from "./routers/github.js";
import { startBuildEventsConsumer } from "./service/build/index.js";
import { createContext } from "./trpc/context.js";
import { appRouter } from "./trpc/router.js";

const log = getLogger();

const port = Number.parseInt(process.env.PORT || "9999", 10);
log.info(`Starting API server on port ${port}`);

// Start listening to build events
await startBuildEventsConsumer({
  batchSize: 10, // Flush after this many logs
  flushIntervalMs: 1000, // Flush after this much time (5 seconds)
});

log.info("Build events consumer started");

// Create Hono app with TRPC
const app = new Hono()
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
  .route("/github", githubRouter)
  .use(
    "/trpc/*",
    trpcServer({
      router: appRouter,
      createContext: async (_opts, c) => {
        const ctx = await createContext({ c });
        // Return as plain object for TRPC
        return {
          userId: ctx.userId,
          db: ctx.db,
          honoCtx: ctx.honoCtx,
        };
      },
      onError({ error, path }) {
        console.error(`Error in tRPC handler on path '${path}':`, error);
      },
    }),
  );

serve({
  fetch: app.fetch,
  port: port,
});
