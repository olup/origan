import { serve } from "@hono/node-server";
import api from "./routers/index.js";

const port = Number.parseInt(process.env.PORT ?? "9999");
console.log(`Starting API server on port ${port}`);

serve({
  fetch: api.fetch,
  port: port,
});
