import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();

// Health check endpoint
app.get("/health", (c) => c.json({ status: "ok" }));

// Example proxy route
app.all("/api/*", async (c) => {
  const path = c.req.path.replace("/api", "");
  // TODO: Implement proxy logic for different services
  return c.json({
    message: "API Gateway",
    path,
    method: c.req.method,
  });
});

const port = process.env.PORT || 3000;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port: Number(port),
});
