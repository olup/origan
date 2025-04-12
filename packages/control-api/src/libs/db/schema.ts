import { relations } from "drizzle-orm";
import { jsonb, pgTable, serial, text, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./columns.helpers.js";

export const projectSchema = pgTable("project", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  name: text("name").notNull(),
  ...timestamps,
});

export const projectRelations = relations(projectSchema, ({ many }) => ({
  deployments: many(deploymentSchema),
}));

export const deploymentSchema = pgTable("deployment", {
  id: uuid("id").primaryKey().defaultRandom(),
  shortId: text("short_id").notNull().unique(),
  config: jsonb("config").notNull(),
  projectId: uuid("project_id")
    .references(() => projectSchema.id, { onDelete: "cascade" })
    .notNull(),
  ...timestamps,
});

// Relations
export const deploymentRelations = relations(
  deploymentSchema,
  ({ many, one }) => ({
    hosts: many(hostSchema),
    project: one(projectSchema, {
      fields: [deploymentSchema.projectId],
      references: [projectSchema.id],
    }),
  }),
);

export const hostSchema = pgTable("host", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  deploymentId: uuid("deployment_id")
    .references(() => deploymentSchema.id, { onDelete: "cascade" })
    .notNull(),
  ...timestamps,
});

export const hostRelations = relations(hostSchema, ({ one }) => ({
  deployment: one(deploymentSchema, {
    fields: [hostSchema.deploymentId],
    references: [deploymentSchema.id],
  }),
}));
