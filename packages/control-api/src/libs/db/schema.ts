import { relations } from "drizzle-orm";
import {
  boolean,
  integer, // Add integer type
  jsonb,
  pgEnum,
  pgTable,
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

export const trackSchema = pgTable(
  "track",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    isSystem: boolean("is_system").notNull().default(false), // Indicates if this is a system track (e.g., prod)
    projectId: uuid("project_id")
      .references(() => projectSchema.id, { onDelete: "cascade" })
      .notNull(),
    ...timestamps,
  },
  (table) => ({
    projectTrackNameIdx: uniqueIndex("project_track_name_idx").on(
      table.projectId,
      table.name,
    ),
  }),
);

export const trackRelations = relations(trackSchema, ({ one, many }) => ({
  project: one(projectSchema, {
    fields: [trackSchema.projectId],
    references: [projectSchema.id],
  }),
  deployments: many(deploymentSchema),
  domains: many(domainSchema),
}));

export const deploymentStatusEnum = pgEnum("deployment_status", [
  "pending",
  "building",
  "deploying",
  "success",
  "error",
  "canceled",
]);

export const deploymentSchema = pgTable(
  "deployment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference").notNull(),
    config: jsonb("config"),
    status: deploymentStatusEnum("status").notNull().default("pending"),
    projectId: uuid("project_id")
      .references(() => projectSchema.id, { onDelete: "cascade" })
      .notNull(),
    trackId: uuid("track_id").references(() => trackSchema.id, {
      onDelete: "set null",
    }),
    buildId: uuid("build_id").references(() => buildSchema.id, {
      onDelete: "set null",
    }),

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
    domains: many(domainSchema),
    project: one(projectSchema, {
      fields: [deploymentSchema.projectId],
      references: [projectSchema.id],
    }),
    track: one(trackSchema, {
      fields: [deploymentSchema.trackId],
      references: [trackSchema.id],
    }),
    build: one(buildSchema, {
      fields: [deploymentSchema.buildId],
      references: [buildSchema.id],
      relationName: "deployment_build",
    }),
  }),
);

export const domainSchema = pgTable("domain", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  deploymentId: uuid("deployment_id").references(() => deploymentSchema.id),
  projectId: uuid("project_id")
    .references(() => projectSchema.id, { onDelete: "cascade" })
    .notNull(),
  trackId: uuid("track_id").references(() => trackSchema.id),
  ...timestamps,
});

export const domainRelations = relations(domainSchema, ({ one }) => ({
  deployment: one(deploymentSchema, {
    fields: [domainSchema.deploymentId],
    references: [deploymentSchema.id],
  }),
  project: one(projectSchema, {
    fields: [domainSchema.projectId],
    references: [projectSchema.id],
  }),
  track: one(trackSchema, {
    fields: [domainSchema.trackId],
    references: [trackSchema.id],
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

  productionBranchName: text("production_branch_name")
    .notNull()
    .default("main"),
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

export const buildStatusEnum = pgEnum("build_status", [
  "pending",
  "in_progress",
  "completed",
  "failed",
]);

export const buildSchema = pgTable("build", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull(),
  projectId: uuid("project_id")
    .references(() => projectSchema.id, { onDelete: "cascade" })
    .notNull(),
  status: buildStatusEnum("status").notNull().default("pending"),
  commitSha: text("commit_sha").notNull(),
  branch: text("branch").notNull(),
  logs: jsonb("logs").default([]).notNull().$type<
    // this type is only enforced at build time
    {
      level: "info" | "error" | "warning";
      message: string;
      timestamp: string;
    }[]
  >(), // Array of log entries
  deployToken: text("deploy_token"), // Encrypted one-time use token
  buildStartedAt: timestamp("build_started_at", { withTimezone: true }), // When the build process actually started
  buildEndedAt: timestamp("build_ended_at", { withTimezone: true }), // When the build process finished (successfully or with failure)
  ...timestamps,
});

export const buildRelations = relations(buildSchema, ({ one }) => ({
  project: one(projectSchema, {
    fields: [buildSchema.projectId],
    references: [projectSchema.id],
  }),
  deployment: one(deploymentSchema, {
    fields: [buildSchema.id],
    references: [deploymentSchema.buildId],
    relationName: "deployment_build",
  }),
}));
