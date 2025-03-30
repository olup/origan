import * as p from "drizzle-orm/pg-core";

export const testSchema = p.pgSchema("test");
export const counterSchema = testSchema.table("counter", {
  id: p.serial("id").primaryKey(),
  counter: p.integer("counter").notNull(),
});
