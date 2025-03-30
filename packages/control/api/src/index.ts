import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { db_url as dbUrl } from "./config";
import { drizzle } from "drizzle-orm/node-postgres";
import { counterSchema } from "./schema";
import * as schema from "./schema";
import { eq, sql } from "drizzle-orm";

const db = drizzle({ connection: dbUrl, schema: schema });

await db
  .insert(counterSchema)
  .values({ id: 1, counter: 0 })
  .onConflictDoNothing();

const api = new Hono()
  .basePath("/api")
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

export type ApiType = typeof api;

const root = new Hono()
  .use(logger())
  .use(cors({ origin: process.env.CORS_ORIGIN || "" }))
  .route("/", api);

const port = Number.parseInt(process.env.PORT ?? "9999");
console.log(`Starting API server on port ${port}`);

serve({
  fetch: root.fetch,
  port: port,
});
