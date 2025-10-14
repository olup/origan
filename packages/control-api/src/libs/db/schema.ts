import { relations } from "drizzle-orm";
import {
  boolean,
  integer, // Add integer type
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex, // Import uniqueIndex
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./columns.helpers.js";

// Organization schema
export const organizationSchema = pgTable("organization", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  name: text("name").notNull(),
  ...timestamps,
});

// Organization membership schema
export const organizationMembershipSchema = pgTable(
  "organization_membership",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => userSchema.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationSchema.id),
    ...timestamps,
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.organizationId] }),
  }),
);

// Organization relations
export const organizationRelations = relations(
  organizationSchema,
  ({ many }) => ({
    memberships: many(organizationMembershipSchema),
    projects: many(projectSchema),
  }),
);

// Organization membership relations
export const organizationMembershipRelations = relations(
  organizationMembershipSchema,
  ({ one }) => ({
    user: one(userSchema, {
      fields: [organizationMembershipSchema.userId],
      references: [userSchema.id],
    }),
    organization: one(organizationSchema, {
      fields: [organizationMembershipSchema.organizationId],
      references: [organizationSchema.id],
    }),
  }),
);

export const projectSchema = pgTable("project", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  name: text("name").notNull(),
  organizationId: uuid("organization_id")
    .references(() => organizationSchema.id)
    .notNull(),
  creatorId: uuid("creator_id").references(() => userSchema.id),
  ...timestamps,
});

export const trackSchema = pgTable(
  "track",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    isSystem: boolean("is_system").notNull().default(false), // Indicates if this is a system track (e.g., prod)
    projectId: uuid("project_id")
      .references(() => projectSchema.id, { onDelete: "cascade" })
      .notNull(),
    environmentId: uuid("environment_id").references(
      () => environmentsSchema.id,
    ),
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
  environment: one(environmentsSchema, {
    fields: [trackSchema.environmentId],
    references: [environmentsSchema.id],
  }),
}));

// Environment schemas
export const environmentsSchema = pgTable(
  "environments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectSchema.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (table) => ({
    projectNameIdx: uniqueIndex("project_name_idx").on(
      table.projectId,
      table.name,
    ),
  }),
);

export const environmentRevisionsSchema = pgTable(
  "environment_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environmentsSchema.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    variables: jsonb("variables").notNull().default({}),
    createdBy: uuid("created_by").references(() => userSchema.id),
    ...timestamps,
  },
  (table) => ({
    envRevisionIdx: uniqueIndex("env_revision_idx").on(
      table.environmentId,
      table.revisionNumber,
    ),
  }),
);

export const environmentsRelations = relations(
  environmentsSchema,
  ({ one, many }) => ({
    project: one(projectSchema, {
      fields: [environmentsSchema.projectId],
      references: [projectSchema.id],
    }),
    revisions: many(environmentRevisionsSchema),
    tracks: many(trackSchema),
  }),
);

export const environmentRevisionsRelations = relations(
  environmentRevisionsSchema,
  ({ one, many }) => ({
    environment: one(environmentsSchema, {
      fields: [environmentRevisionsSchema.environmentId],
      references: [environmentsSchema.id],
    }),
    createdByUser: one(userSchema, {
      fields: [environmentRevisionsSchema.createdBy],
      references: [userSchema.id],
    }),
    deployments: many(deploymentSchema),
  }),
);

export const deploymentStatusEnum = pgEnum("deployment_status", [
  "pending",
  "building",
  "deploying",
  "success",
  "error",
  "canceled",
]);

export const certificateStatusEnum = pgEnum("certificate_status", [
  "none",
  "pending",
  "valid",
  "error",
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
    environmentRevisionId: uuid("environment_revision_id").references(
      () => environmentRevisionsSchema.id,
    ),

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
    environmentRevision: one(environmentRevisionsSchema, {
      fields: [deploymentSchema.environmentRevisionId],
      references: [environmentRevisionsSchema.id],
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
  isCustom: boolean("is_custom").notNull().default(false),
  certificateStatus: certificateStatusEnum("certificate_status")
    .notNull()
    .default("none"),
  certificateIssuedAt: timestamp("certificate_issued_at", {
    withTimezone: true,
  }),
  certificateExpiresAt: timestamp("certificate_expires_at", {
    withTimezone: true,
  }),
  lastCertificateError: text("last_certificate_error"),
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
  ...timestamps,
});

export const userRelations = relations(userSchema, ({ many, one }) => ({
  createdProjects: many(projectSchema),
  organizationMemberships: many(organizationMembershipSchema),
  refreshTokens: many(refreshTokenSchema),
  githubAppInstallation: one(githubAppInstallationSchema),
}));

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

// GitHub App Installation schema
export const githubAppInstallationSchema = pgTable("github_app_installation", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubInstallationId: integer("github_installation_id").notNull().unique(),
  githubAccountId: text("github_account_id").notNull(),
  userId: uuid("user_id")
    .references(() => userSchema.id)
    .notNull()
    .unique(),
  ...timestamps,
});

// GitHub App Installation relations
export const githubAppInstallationRelations = relations(
  githubAppInstallationSchema,
  ({ one, many }) => ({
    user: one(userSchema, {
      fields: [githubAppInstallationSchema.userId],
      references: [userSchema.id],
    }),
    githubConfigs: many(githubConfigSchema),
  }),
);

// GitHub configuration schema
export const githubConfigSchema = pgTable("github_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projectSchema.id)
    .notNull()
    .unique(), // One GitHub config per project
  githubRepositoryId: integer("github_repository_id").notNull(),
  githubRepositoryFullName: text("github_repository_full_name").notNull(),
  githubAppInstallationId: uuid("github_app_installation_id")
    .references(() => githubAppInstallationSchema.id)
    .notNull(),
  projectRootPath: text("project_root_path").notNull().default(""),
  ...timestamps,
});

// GitHub config relations
export const githubBranchRuleSchema = pgTable(
  "github_branch_rule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projectSchema.id, { onDelete: "cascade" })
      .notNull(),
    githubConfigId: uuid("github_config_id")
      .references(() => githubConfigSchema.id, { onDelete: "cascade" })
      .notNull(),
    branchPattern: text("branch_pattern").notNull(),
    environmentId: uuid("environment_id")
      .references(() => environmentsSchema.id, { onDelete: "cascade" })
      .notNull(),
    enablePreviews: boolean("enable_previews").notNull().default(false),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps,
  },
  (table) => ({
    projectPatternIdx: uniqueIndex("github_branch_rule_project_pattern_idx").on(
      table.projectId,
      table.branchPattern,
    ),
  }),
);

export const githubBranchRuleRelations = relations(
  githubBranchRuleSchema,
  ({ one }) => ({
    project: one(projectSchema, {
      fields: [githubBranchRuleSchema.projectId],
      references: [projectSchema.id],
    }),
    githubConfig: one(githubConfigSchema, {
      fields: [githubBranchRuleSchema.githubConfigId],
      references: [githubConfigSchema.id],
    }),
    environment: one(environmentsSchema, {
      fields: [githubBranchRuleSchema.environmentId],
      references: [environmentsSchema.id],
    }),
  }),
);

export const githubConfigRelations = relations(
  githubConfigSchema,
  ({ one, many }) => ({
    project: one(projectSchema, {
      fields: [githubConfigSchema.projectId],
      references: [projectSchema.id],
    }),
    githubAppInstallation: one(githubAppInstallationSchema, {
      fields: [githubConfigSchema.githubAppInstallationId],
      references: [githubAppInstallationSchema.id],
    }),
    branchRules: many(githubBranchRuleSchema),
  }),
);

export const projectRelations = relations(projectSchema, ({ many, one }) => ({
  deployments: many(deploymentSchema),
  organization: one(organizationSchema, {
    fields: [projectSchema.organizationId],
    references: [organizationSchema.id],
  }),
  creator: one(userSchema, {
    fields: [projectSchema.creatorId],
    references: [userSchema.id],
  }),
  githubConfig: one(githubConfigSchema),
  environments: many(environmentsSchema),
  tracks: many(trackSchema),
  githubBranchRules: many(githubBranchRuleSchema),
}));

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
