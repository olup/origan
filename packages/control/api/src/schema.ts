import { relations } from "drizzle-orm";
import * as p from "drizzle-orm/pg-core";

export const testSchema = p.pgSchema("test");
export const counterSchema = testSchema.table("counter", {
  id: p.serial("id").primaryKey(),
  counter: p.integer("counter").notNull(),
});

export const deploymentSchema = testSchema.table("deployment", {
  id: p.uuid("id").primaryKey().defaultRandom(),
  shortId: p.text("short_id").notNull().unique(),
  config: p.jsonb("config").notNull(),
});

// Relations
export const deploymentRelations = relations(deploymentSchema, ({ many }) => ({
  hosts: many(hostSchema),
}));

export const hostSchema = testSchema.table("host", {
  id: p.serial("id").primaryKey(),
  name: p.text("name").notNull().unique(),
  deploymentId: p
    .uuid("deployment_id")
    .references(() => deploymentSchema.id)
    .notNull(),
});

export const hostRelations = relations(hostSchema, ({ one }) => ({
  deployment: one(deploymentSchema, {
    fields: [hostSchema.deploymentId],
    references: [deploymentSchema.id],
  }),
}));
