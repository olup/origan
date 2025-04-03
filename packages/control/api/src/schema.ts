import { relations } from "drizzle-orm";
import { jsonb, pgTable, serial, text, uuid } from "drizzle-orm/pg-core";

export const deploymentSchema = pgTable("deployment", {
  id: uuid("id").primaryKey().defaultRandom(),
  shortId: text("short_id").notNull().unique(),
  config: jsonb("config").notNull(),
});

// Relations
export const deploymentRelations = relations(deploymentSchema, ({ many }) => ({
  hosts: many(hostSchema),
}));

export const hostSchema = pgTable("host", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  deploymentId: uuid("deployment_id")
    .references(() => deploymentSchema.id)
    .notNull(),
});

export const hostRelations = relations(hostSchema, ({ one }) => ({
  deployment: one(deploymentSchema, {
    fields: [hostSchema.deploymentId],
    references: [deploymentSchema.id],
  }),
}));
