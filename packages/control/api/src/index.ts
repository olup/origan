import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { db_url as dbUrl } from "./config.js";
import { drizzle } from "drizzle-orm/node-postgres";
import { counterSchema } from "./schema.js";
import * as schema from "./schema.js";
import { eq, sql } from "drizzle-orm";

const db = drizzle({ connection: dbUrl, schema: schema });

await db
  .insert(counterSchema)
  .values({ id: 1, counter: 0 })
  .onConflictDoNothing();

const api = new Hono()
  .get("/hello", (c) => c.json({ message: "Hello" }))
  .get("/counter", async (c) => {
    const counterValue = await db.query.counterSchema.findFirst({
      where: eq(counterSchema.id, 1),
    });
    return c.json({
      counter: counterValue?.counter,
    });
  })
  .post("/counter", async (c) => {
    const counters = await db
      .update(counterSchema)
      .set({
        counter: sql`${counterSchema.counter} + 1`,
      })
      .where(eq(counterSchema.id, 1))
      .returning({ counter: counterSchema.counter });
    return c.json({ counter: counters[0].counter });
  });

const root = new Hono()
  .use(logger())
  .use(cors({ origin: process.env.CORS_ORIGIN || "" }))
  .get("/.healthz", (c) => c.json({ message: "OK" }))
  .route("/api/", api);

export type ApiType = typeof root;

const port = Number.parseInt(process.env.PORT ?? "9999");
console.log(`Starting API server on port ${port}`);

serve({
  fetch: root.fetch,
  port: port,
});
