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

export default api;
export type ApiType = typeof api;
