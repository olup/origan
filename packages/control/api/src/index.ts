import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

let counter = 0;

const api = new Hono()
  .use(cors({ origin: process.env.CORS_ORIGIN || "" }))
  .basePath("/api")
  .get("/hello", (c) => c.json({ message: "Hello" }))
  .get("/counter", (c) => c.json({ counter: counter }))
  .post("/counter", (c) => {
    counter++;
    return c.json({ counter });
  });

export type ApiType = typeof api;

new Hono().route("/", api);

const port = Number.parseInt(process.env.PORT ?? "9999");
console.log(`Starting API server on port ${port}`);
serve({
  fetch: api.fetch,
  port: port,
});
