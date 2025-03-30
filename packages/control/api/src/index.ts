import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

let counter = 0;

const api = new Hono()
  .basePath("/api")
  .get("/hello", (c) => c.json({ message: "Hello" }))
  .get("/counter", (c) => c.json({ counter: counter }))
  .post("/counter", (c) => {
    counter++;
    return c.json({ counter });
  });

export type ApiType = typeof api;

const root =new Hono()
  .use(logger())
  .use(cors({ origin: process.env.CORS_ORIGIN || "" }))
  .route("/", api);

const port = Number.parseInt(process.env.PORT ?? "9999");
console.log(`Starting API server on port ${port}`);
serve({
  fetch: root.fetch,
  port: port,
});
