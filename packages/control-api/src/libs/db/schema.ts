import { relations } from "drizzle-orm";
import {
  integer, // Add integer type
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex, // Import uniqueIndex
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./columns.helpers.js";

export const projectSchema = pgTable("project", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  name: text("name").notNull(),
  userId: uuid("user_id")
    .references(() => userSchema.id)
    .notNull(),
  ...timestamps,
});

export const projectRelations = relations(projectSchema, ({ many, one }) => ({
  deployments: many(deploymentSchema),
  user: one(userSchema, {
    fields: [projectSchema.userId],
    references: [userSchema.id],
  }),
  githubConfig: one(githubConfigSchema),
}));

export const deploymentSchema = pgTable(
  "deployment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference").notNull(),
    config: jsonb("config").notNull(),
    projectId: uuid("project_id")
      .references(() => projectSchema.id, { onDelete: "cascade" })
      .notNull(),

    ...timestamps,
  },
  // Deployment reference should be unique per project
  // but not globally unique
  (table) => {
    return {
      projectReferenceIdx: uniqueIndex("project_reference_idx").on(
        table.projectId,
        table.reference,
      ),
    };
  },
);

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

// Auth-related schemas
export const userSchema = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubProviderReference: text("github_provider_reference").unique(),
  username: text("username").notNull(),
  contactEmail: text("contact_email").notNull(),
  githubAppInstallationId: integer("github_app_installation_id"),
  ...timestamps,
});

// TODO: handle failed sessions
export const authSessionStatusEnum = pgEnum("auth_session_status", [
  "pending",
  "completed",
]);

export const authSessionSchema = pgTable("auth_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: text("session_id").notNull().unique(),
  status: authSessionStatusEnum().notNull(),

  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,

  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
});

export const refreshTokenSchema = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => userSchema.id)
    .notNull(),
  tokenHash: text("token_hash").notNull(),

  createdAt: timestamps.createdAt,
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
});

// GitHub configuration schema
export const githubConfigSchema = pgTable("github_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projectSchema.id)
    .notNull()
    .unique(), // One GitHub config per project
  githubRepositoryId: integer("github_repository_id").notNull(),
  githubRepositoryFullName: text("github_repository_full_name").notNull(),
  ...timestamps,
});

// GitHub config relations
export const githubConfigRelations = relations(
  githubConfigSchema,
  ({ one }) => ({
    project: one(projectSchema, {
      fields: [githubConfigSchema.projectId],
      references: [projectSchema.id],
    }),
  }),
);
