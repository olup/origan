import { serve } from "@hono/node-server";
import { Hono } from "hono";

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

new Hono().route("/", api);

const port = Number.parseInt(process.env.PORT ?? "9999");
console.log(`Starting API server on port ${port}`);
serve({
  fetch: api.fetch,
  port: port,
});
