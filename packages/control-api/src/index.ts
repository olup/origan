import { serve } from "@hono/node-server";
import api from "./routers/index.js";
import { startBuildEventsConsumer } from "./service/build/index.js";

const port = Number.parseInt(process.env.PORT ?? "9999");
console.log(`Starting API server on port ${port}`);

// Start listening to build events
await startBuildEventsConsumer({
  batchSize: 10, // Flush after this many logs
  flushIntervalMs: 1000, // Flush after this much time (5 seconds)
});

console.log("Build events consumer started");

serve({
  fetch: api.fetch,
  port: port,
});
