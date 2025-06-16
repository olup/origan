import { serve } from "@hono/node-server";
import { getLogger } from "./instrumentation.js";
import api from "./routers/index.js";
import { startBuildEventsConsumer } from "./service/build/index.js";

const log = getLogger();

const port = Number.parseInt(process.env.PORT ?? "9999");
log.info(`Starting API server on port ${port}`);

// Start listening to build events
await startBuildEventsConsumer({
  batchSize: 10, // Flush after this many logs
  flushIntervalMs: 1000, // Flush after this much time (5 seconds)
});

log.info("Build events consumer started");

serve({
  fetch: api.fetch,
  port: port,
});
