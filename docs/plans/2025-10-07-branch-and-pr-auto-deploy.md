# RFC: Branch and PR Auto-Deploy Configuration

**Date:** 2025-10-07
**Status:** Draft
**Author:** System

## Overview

### Current State
- **Main branch only**: The production branch (typically `main`) automatically deploys to the `prod` track with the production environment
- **Other branches ignored**: Push events to non-production branches are logged but do not trigger deployments
- **No PR support**: Pull requests cannot be automatically deployed for preview/testing
- **Track model**: Tracks represent deployment targets with associated domains (e.g., `prod--project-ref.origan.app`)

### Problem
Teams need flexibility to:
1. Auto-deploy feature branches for staging/testing environments
2. Auto-deploy PRs targeting configured branches for review
3. Clean up tracks when branches/PRs are deleted/closed
4. Configure per-branch whether PRs should auto-deploy

### Goals
1. Allow project administrators to declare which GitHub branches should auto-deploy
2. Support automatic PR deployments when targeting configured branches
3. Implement automatic cleanup of tracks when branches are deleted or PRs are closed
4. Use track naming conventions to enable cleanup without extensive database overhead

## Database Schema

### New Table: `branchDeploymentConfigSchema`

```typescript
export const branchDeploymentConfigSchema = pgTable(
  "branch_deployment_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectSchema.id, { onDelete: "cascade" }),
    branchName: text("branch_name").notNull(),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environmentsSchema.id),
    autoDeployPRs: boolean("auto_deploy_prs").notNull().default(false),
    ...timestamps,
  },
  (table) => ({
    projectBranchIdx: uniqueIndex("project_branch_idx").on(
      table.projectId,
      table.branchName,
    ),
  }),
);
```

**Relations:**
```typescript
export const branchDeploymentConfigRelations = relations(
  branchDeploymentConfigSchema,
  ({ one }) => ({
    project: one(projectSchema, {
      fields: [branchDeploymentConfigSchema.projectId],
      references: [projectSchema.id],
    }),
    environment: one(environmentsSchema, {
      fields: [branchDeploymentConfigSchema.environmentId],
      references: [environmentsSchema.id],
    }),
  }),
);
```

### Design Decision: No PR or Branch-Track Tables

**Rationale:** We use a **naming convention** for tracks instead of explicit relationship tables:
- **Branch tracks**: Sanitized branch name (e.g., `feature/auth` → `feature-auth`)
- **PR tracks**: `pr-{prNumber}` (e.g., PR #344 → `pr-344`)

This allows us to:
1. Find tracks by name pattern when cleaning up
2. Avoid extra join tables
3. Keep the schema simple
4. Leverage existing track infrastructure

**Cleanup strategy:**
- On PR close: Query tracks where `name = 'pr-{prNumber}'`
- On branch delete: Query tracks where `name = sanitize(branchName)`
- Delete track → cascade deletes domains and orphans deployments

## Backend Implementation

### Service Layer

#### `branch-config.service.ts` (New)

```typescript
/**
 * Add a branch deployment configuration
 */
export async function addBranchConfig({
  projectId,
  branchName,
  environmentId,
  autoDeployPRs,
}: {
  projectId: string;
  branchName: string;
  environmentId: string;
  autoDeployPRs: boolean;
}) {
  const [config] = await db
    .insert(branchDeploymentConfigSchema)
    .values({
      projectId,
      branchName,
      environmentId,
      autoDeployPRs,
    })
    .returning();
  return config;
}

/**
 * Remove a branch deployment configuration
 * Optionally delete the associated track
 */
export async function removeBranchConfig({
  projectId,
  branchName,
  deleteTrack: shouldDeleteTrack = false,
}: {
  projectId: string;
  branchName: string;
  deleteTrack?: boolean;
}) {
  await db
    .delete(branchDeploymentConfigSchema)
    .where(
      and(
        eq(branchDeploymentConfigSchema.projectId, projectId),
        eq(branchDeploymentConfigSchema.branchName, branchName),
      ),
    );

  if (shouldDeleteTrack) {
    const track = await findTrackByName(projectId, sanitizeBranchName(branchName));
    if (track) {
      await deleteTrack(track.id);
    }
  }
}

/**
 * List all branch configs for a project
 */
export async function listBranchConfigs(projectId: string) {
  return await db.query.branchDeploymentConfigSchema.findMany({
    where: eq(branchDeploymentConfigSchema.projectId, projectId),
    with: {
      environment: true,
    },
  });
}

/**
 * Get a branch config by project and branch name
 */
export async function getBranchConfig(projectId: string, branchName: string) {
  return await db.query.branchDeploymentConfigSchema.findFirst({
    where: and(
      eq(branchDeploymentConfigSchema.projectId, projectId),
      eq(branchDeploymentConfigSchema.branchName, branchName),
    ),
    with: {
      environment: true,
    },
  });
}

/**
 * Sanitize branch name for use as track name
 * Examples:
 *   feature/auth → feature-auth
 *   hotfix/PROD-123 → hotfix-prod-123
 */
function sanitizeBranchName(branchName: string): string {
  return branchName
    .toLowerCase()
    .replace(/\//g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .substring(0, 63); // DNS label max length
}
```

#### Enhanced `github.service.ts`

##### `handlePushEvent` (Enhanced)

```typescript
export async function handlePushEvent(payload: {
  ref: string;
  head_commit: { id: string };
  repository: { id: number; full_name: string };
}) {
  const log = getLogger();
  const branchName = payload.ref.replace("refs/heads/", "");
  const commitSha = payload.head_commit.id;
  const githubRepositoryId = payload.repository.id;

  const githubConfigWithProject = await db.query.githubConfigSchema.findFirst({
    where: eq(githubConfigSchema.githubRepositoryId, githubRepositoryId),
    with: {
      project: true,
      githubAppInstallation: true,
    },
  });

  if (!githubConfigWithProject?.project) {
    log.info(`No project found for repository ID ${githubRepositoryId}`);
    return;
  }

  const project = githubConfigWithProject.project;

  // Check if this is the production branch
  if (branchName === githubConfigWithProject.productionBranchName) {
    log.info(`Push to production branch "${branchName}", deploying to prod track`);
    await triggerBuildTask(project.id, branchName, commitSha);
    return;
  }

  // Check if this branch has a deployment config
  const branchConfig = await getBranchConfig(project.id, branchName);
  if (!branchConfig) {
    log.info(`Branch "${branchName}" not configured for auto-deploy, skipping`);
    return;
  }

  log.info(`Branch "${branchName}" configured for auto-deploy to ${branchConfig.environment.name}`);

  // Trigger build with sanitized branch name as track
  const trackName = sanitizeBranchName(branchName);
  await triggerBuildTask(project.id, branchName, commitSha, trackName, branchConfig.environmentId);
}
```

##### `handlePullRequestEvent` (New)

```typescript
const PullRequestEventPayloadSchema = z.object({
  action: z.enum(["opened", "synchronize", "reopened", "closed"]),
  number: z.number(),
  pull_request: z.object({
    number: z.number(),
    head: z.object({
      sha: z.string(),
      ref: z.string(), // PR branch name
    }),
    base: z.object({
      ref: z.string(), // Target branch name
    }),
    merged: z.boolean(),
  }),
  repository: z.object({
    id: z.number(),
    full_name: z.string(),
  }),
});

export async function handlePullRequestEvent(
  payload: z.infer<typeof PullRequestEventPayloadSchema>
) {
  const log = getLogger();
  const { action, pull_request, repository } = payload;
  const prNumber = pull_request.number;
  const targetBranch = pull_request.base.ref;
  const headSha = pull_request.head.sha;
  const sourceBranch = pull_request.head.ref;

  log.info(
    `PR #${prNumber}: ${action} - ${sourceBranch} → ${targetBranch} (${repository.full_name})`
  );

  const githubConfigWithProject = await db.query.githubConfigSchema.findFirst({
    where: eq(githubConfigSchema.githubRepositoryId, repository.id),
    with: {
      project: true,
      githubAppInstallation: true,
    },
  });

  if (!githubConfigWithProject?.project) {
    log.info(`No project found for repository ID ${repository.id}`);
    return;
  }

  const project = githubConfigWithProject.project;

  // Handle PR close/merge
  if (action === "closed") {
    log.info(`PR #${prNumber} closed, cleaning up track`);
    await cleanupPRTrack(project.id, prNumber);
    return;
  }

  // Handle PR open/sync/reopen
  // Check if target branch has config with autoDeployPRs enabled
  const branchConfig = await getBranchConfig(project.id, targetBranch);
  if (!branchConfig || !branchConfig.autoDeployPRs) {
    log.info(
      `Target branch "${targetBranch}" not configured for PR auto-deploy, skipping`
    );
    return;
  }

  log.info(
    `PR #${prNumber} targeting "${targetBranch}" - deploying to pr-${prNumber} track`
  );

  // Create PR track with naming convention: pr-{prNumber}
  const trackName = `pr-${prNumber}`;
  await triggerBuildTask(
    project.id,
    sourceBranch,
    headSha,
    trackName,
    branchConfig.environmentId
  );
}

/**
 * Clean up PR track when PR is closed/merged
 */
async function cleanupPRTrack(projectId: string, prNumber: number) {
  const log = getLogger();
  const trackName = `pr-${prNumber}`;

  const track = await findTrackByName(projectId, trackName);
  if (!track) {
    log.info(`No track found for PR #${prNumber}`);
    return;
  }

  log.info(`Deleting track ${track.id} for PR #${prNumber}`);

  // TODO: Implement full cleanup
  // - Delete track (cascades to domains)
  // - Mark deployments as orphaned
  // - Optional: Clean up S3 artifacts
  await deleteTrack(track.id);
}
```

##### `handleDeleteEvent` (New)

```typescript
const DeleteEventPayloadSchema = z.object({
  ref: z.string(),
  ref_type: z.enum(["branch", "tag"]),
  repository: z.object({
    id: z.number(),
    full_name: z.string(),
  }),
});

export async function handleDeleteEvent(
  payload: z.infer<typeof DeleteEventPayloadSchema>
) {
  const log = getLogger();
  const { ref, ref_type, repository } = payload;

  if (ref_type !== "branch") {
    log.info(`Delete event for ${ref_type} "${ref}", skipping`);
    return;
  }

  log.info(`Branch "${ref}" deleted from ${repository.full_name}`);

  const githubConfigWithProject = await db.query.githubConfigSchema.findFirst({
    where: eq(githubConfigSchema.githubRepositoryId, repository.id),
    with: {
      project: true,
    },
  });

  if (!githubConfigWithProject?.project) {
    log.info(`No project found for repository ID ${repository.id}`);
    return;
  }

  const project = githubConfigWithProject.project;
  const trackName = sanitizeBranchName(ref);
  const track = await findTrackByName(project.id, trackName);

  if (!track) {
    log.info(`No track found for branch "${ref}"`);
    return;
  }

  log.info(`Deleting track ${track.id} for branch "${ref}"`);

  // TODO: Implement full cleanup
  // - Delete track (cascades to domains)
  // - Mark deployments as orphaned
  // - Optional: Clean up S3 artifacts
  // - Optional: Remove branch config
  await deleteTrack(track.id);
}
```

#### Enhanced `track.service.ts`

```typescript
/**
 * Find a track by name and project ID
 */
export async function findTrackByName(projectId: string, trackName: string) {
  return await db.query.trackSchema.findFirst({
    where: and(
      eq(trackSchema.projectId, projectId),
      eq(trackSchema.name, trackName),
    ),
  });
}
```

#### Enhanced `build/manager.ts`

Update `triggerBuildTask` to accept optional `trackName` and `environmentId`:

```typescript
export async function triggerBuildTask(
  projectId: string,
  branchName: string,
  commitSha: string,
  trackName?: string,
  environmentId?: string,
) {
  // ... existing code ...

  // If no trackName provided, use existing logic
  if (!trackName) {
    trackName = branchName === githubConfig.productionBranchName ? "prod" : branchName;
  }

  // Create deployment with specified or determined track
  const initiateDeploymentResult = await initiateDeployment({
    projectRef: project.reference,
    buildId: build.id,
    trackName,
    environmentId, // Pass environment ID if provided
  });

  // ... rest of existing code ...
}
```

### TRPC Router

#### `branches.router.ts` (New)

```typescript
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../libs/db/index.js";
import { projectSchema } from "../../libs/db/schema.js";
import {
  addBranchConfig,
  getBranchConfig,
  listBranchConfigs,
  removeBranchConfig,
  sanitizeBranchName,
} from "../../service/branch-config.service.js";
import { getEnvironmentByName } from "../../service/environment.service.js";
import { findTrackByName } from "../../service/track.service.js";
import { protectedProcedure, router } from "../init.js";

export const branchesRouter = router({
  /**
   * Add a branch deployment configuration
   */
  addBranchConfig: protectedProcedure
    .input(
      z.object({
        projectReference: z.string().min(1),
        branchName: z.string().min(1),
        environmentName: z.string().min(1),
        autoDeployPRs: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      // Convert projectReference to projectId
      const project = await db.query.projectSchema.findFirst({
        where: eq(projectSchema.reference, input.projectReference),
      });
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Project not found: ${input.projectReference}`,
        });
      }

      // Convert environmentName to environmentId
      const environment = await getEnvironmentByName(
        project.id,
        input.environmentName
      );
      if (!environment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Environment not found: ${input.environmentName}`,
        });
      }

      // Check if branch config already exists
      const existing = await getBranchConfig(project.id, input.branchName);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Branch "${input.branchName}" already configured`,
        });
      }

      const config = await addBranchConfig({
        projectId: project.id,
        branchName: input.branchName,
        environmentId: environment.id,
        autoDeployPRs: input.autoDeployPRs,
      });

      return config;
    }),

  /**
   * Remove a branch deployment configuration
   */
  removeBranchConfig: protectedProcedure
    .input(
      z.object({
        projectReference: z.string().min(1),
        branchName: z.string().min(1),
        deleteTrack: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const project = await db.query.projectSchema.findFirst({
        where: eq(projectSchema.reference, input.projectReference),
      });
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Project not found: ${input.projectReference}`,
        });
      }

      await removeBranchConfig({
        projectId: project.id,
        branchName: input.branchName,
        deleteTrack: input.deleteTrack,
      });

      return { success: true };
    }),

  /**
   * List all branch configurations for a project
   */
  listBranchConfigs: protectedProcedure
    .input(
      z.object({
        projectReference: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      const project = await db.query.projectSchema.findFirst({
        where: eq(projectSchema.reference, input.projectReference),
        with: { githubConfig: true },
      });
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Project not found: ${input.projectReference}`,
        });
      }

      const configs = await listBranchConfigs(project.id);

      // Enrich with track info
      const enrichedConfigs = await Promise.all(
        configs.map(async (config) => {
          const trackName = sanitizeBranchName(config.branchName);
          const track = await findTrackByName(project.id, trackName);
          return {
            ...config,
            track: track ? { id: track.id, name: track.name } : null,
            isProduction: config.branchName === project.githubConfig?.productionBranchName,
          };
        })
      );

      return enrichedConfigs;
    }),
});
```

### Webhook Router Updates

Update `routers/github.ts` to handle new webhook events:

```typescript
// Add new event handlers
if (event === "pull_request") {
  const prEventPayload = PullRequestEventPayloadSchema.parse(payload);
  await handlePullRequestEvent(prEventPayload);
} else if (event === "delete") {
  const deleteEventPayload = DeleteEventPayloadSchema.parse(payload);
  await handleDeleteEvent(deleteEventPayload);
}
```

## Frontend Implementation

### ProjectPage Updates

#### Updated Tab Detection ([ProjectPage.tsx:244-250](packages/admin/src/pages/ProjectPage.tsx))

```typescript
const getActiveTab = () => {
  if (location.includes("/domains")) return "domains";
  if (location.includes("/branches")) return "branches";
  if (location.includes("/environments")) return "environments";
  return "deployments";
};
const activeTab = getActiveTab();
```

#### Updated Tab Navigation

```tsx
<TabLink
  href={`/projects/${projectReference}`}
  isActive={activeTab === "deployments"}
>
  Deployments
</TabLink>
<TabLink
  href={`/projects/${projectReference}/domains`}
  isActive={activeTab === "domains"}
>
  Domains
</TabLink>
<TabLink
  href={`/projects/${projectReference}/branches`}
  isActive={activeTab === "branches"}
>
  Branches
</TabLink>
<TabLink
  href={`/projects/${projectReference}/environments`}
  isActive={activeTab === "environments"}
>
  Environments
</TabLink>
```

#### New Route

```tsx
<Route path="/projects/:reference/branches">
  {() => <BranchConfigManager projectReference={projectReference} />}
</Route>
```

### New Component: `BranchConfigManager.tsx`

```tsx
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { queryClient, trpc } from "../utils/trpc";

interface BranchConfigManagerProps {
  projectReference: string;
}

export const BranchConfigManager = ({
  projectReference,
}: BranchConfigManagerProps) => {
  const [addingBranch, setAddingBranch] = useState(false);

  // Fetch branch configs
  const { data: configs, isLoading: configsLoading } = useQuery(
    trpc.branches.listBranchConfigs.queryOptions({
      projectReference,
    })
  );

  // Fetch available branches from GitHub
  const { data: project } = useQuery(
    trpc.projects.get.queryOptions({ reference: projectReference })
  );

  const { data: githubBranches } = useQuery(
    trpc.github.getBranches.queryOptions(
      { githubRepositoryId: project?.githubConfig?.githubRepositoryId || 0 },
      { enabled: Boolean(project?.githubConfig?.githubRepositoryId) }
    )
  );

  // Mutations
  const addConfigMutation = useMutation(
    trpc.branches.addBranchConfig.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.branches.listBranchConfigs.getQueryKey({
            projectReference,
          }),
        });
        setAddingBranch(false);
      },
    })
  );

  const removeConfigMutation = useMutation(
    trpc.branches.removeBranchConfig.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.branches.listBranchConfigs.getQueryKey({
            projectReference,
          }),
        });
      },
    })
  );

  const form = useForm({
    initialValues: {
      branchName: "",
      environmentName: "preview",
      autoDeployPRs: false,
    },
    validate: {
      branchName: (value) => (!value ? "Branch is required" : null),
      environmentName: (value) => (!value ? "Environment is required" : null),
    },
  });

  const handleAddConfig = (values: typeof form.values) => {
    addConfigMutation.mutate({
      projectReference,
      branchName: values.branchName,
      environmentName: values.environmentName,
      autoDeployPRs: values.autoDeployPRs,
    });
  };

  const handleRemoveConfig = (branchName: string, isProduction: boolean) => {
    if (isProduction) {
      return; // Cannot remove production branch config
    }

    modals.openConfirmModal({
      title: "Remove branch configuration",
      children: (
        <Text size="sm">
          Are you sure you want to remove auto-deploy configuration for branch "
          {branchName}"? This will not delete the track or deployments.
        </Text>
      ),
      labels: { confirm: "Remove", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        removeConfigMutation.mutate({
          projectReference,
          branchName,
          deleteTrack: false,
        });
      },
    });
  };

  if (configsLoading) {
    return <Text>Loading...</Text>;
  }

  const availableBranches =
    githubBranches?.filter(
      (branch) => !configs?.some((config) => config.branchName === branch.name)
    ) || [];

  return (
    <Card withBorder padding="xl">
      <Stack>
        <Group justify="space-between">
          <Title order={3}>Branch Auto-Deploy Configuration</Title>
          {!addingBranch && (
            <Button
              leftSection={<Plus size={16} />}
              onClick={() => setAddingBranch(true)}
              disabled={availableBranches.length === 0}
            >
              Add Branch
            </Button>
          )}
        </Group>

        <Text size="sm" c="dimmed">
          Configure which branches should automatically deploy when pushed, and
          whether their pull requests should also auto-deploy.
        </Text>

        {addingBranch && (
          <Card withBorder padding="md" style={{ backgroundColor: "#f9fafb" }}>
            <form onSubmit={form.onSubmit(handleAddConfig)}>
              <Stack gap="md">
                <Select
                  label="Branch"
                  placeholder="Select a branch"
                  data={availableBranches.map((branch) => ({
                    value: branch.name,
                    label: branch.name,
                  }))}
                  {...form.getInputProps("branchName")}
                  required
                />
                <Select
                  label="Environment"
                  placeholder="Select environment"
                  data={[
                    { value: "production", label: "Production" },
                    { value: "preview", label: "Preview" },
                  ]}
                  {...form.getInputProps("environmentName")}
                  required
                />
                <Checkbox
                  label="Auto-deploy pull requests targeting this branch"
                  {...form.getInputProps("autoDeployPRs", { type: "checkbox" })}
                />
                <Group>
                  <Button type="submit" loading={addConfigMutation.isPending}>
                    Add Configuration
                  </Button>
                  <Button
                    variant="subtle"
                    onClick={() => {
                      setAddingBranch(false);
                      form.reset();
                    }}
                  >
                    Cancel
                  </Button>
                </Group>
              </Stack>
            </form>
          </Card>
        )}

        {configs && configs.length > 0 ? (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Branch</Table.Th>
                <Table.Th>Environment</Table.Th>
                <Table.Th>Auto-deploy PRs</Table.Th>
                <Table.Th>Track Status</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {configs.map((config) => (
                <Table.Tr key={config.id}>
                  <Table.Td>
                    <Group gap="xs">
                      <Text>{config.branchName}</Text>
                      {config.isProduction && (
                        <Badge size="sm" color="blue">
                          Production
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light">{config.environment.name}</Badge>
                  </Table.Td>
                  <Table.Td>
                    {config.autoDeployPRs ? (
                      <Badge color="green" size="sm">
                        Enabled
                      </Badge>
                    ) : (
                      <Badge color="gray" size="sm" variant="outline">
                        Disabled
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {config.track ? (
                      <Badge color="teal" size="sm">
                        Active
                      </Badge>
                    ) : (
                      <Badge color="gray" size="sm" variant="outline">
                        No track
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {!config.isProduction && (
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        leftSection={<Trash2 size={14} />}
                        onClick={() =>
                          handleRemoveConfig(
                            config.branchName,
                            config.isProduction
                          )
                        }
                        loading={removeConfigMutation.isPending}
                      >
                        Remove
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Card withBorder padding="lg" style={{ textAlign: "center" }}>
            <Stack align="center" gap="sm">
              <AlertCircle size={48} color="#868e96" />
              <Text c="dimmed">
                No branches configured for auto-deploy. Add a branch to get
                started.
              </Text>
            </Stack>
          </Card>
        )}
      </Stack>
    </Card>
  );
};
```

## Track Naming & Cleanup Strategy

### Track Naming Convention

This is **critical** for enabling cleanup without extra database tables.

| Type | Example Input | Track Name | Domain |
|------|---------------|------------|--------|
| Production | `main` | `prod` | `prod--project-ref.origan.app` |
| Branch | `feature/auth` | `feature-auth` | `feature-auth--project-ref.origan.app` |
| Branch | `hotfix/PROD-123` | `hotfix-prod-123` | `hotfix-prod-123--project-ref.origan.app` |
| PR | PR #344 | `pr-344` | `pr-344--project-ref.origan.app` |
| PR | PR #12 | `pr-12` | `pr-12--project-ref.origan.app` |

### Sanitization Rules

```typescript
function sanitizeBranchName(branchName: string): string {
  return branchName
    .toLowerCase()                    // Lowercase for consistency
    .replace(/\//g, "-")              // Replace slashes with hyphens
    .replace(/[^a-z0-9-]/g, "")       // Remove invalid DNS characters
    .substring(0, 63);                // DNS label max length
}
```

### Cleanup Process

#### PR Cleanup (on PR close/merge)

```typescript
async function cleanupPRTrack(projectId: string, prNumber: number) {
  const trackName = `pr-${prNumber}`;
  const track = await findTrackByName(projectId, trackName);

  if (track) {
    await deleteTrack(track.id);
    // Cascade deletes:
    // - domains (WHERE trackId = track.id)
    // - deployment.trackId SET NULL (deployments become orphaned)
  }
}
```

#### Branch Cleanup (on branch delete)

```typescript
async function cleanupBranchTrack(projectId: string, branchName: string) {
  const trackName = sanitizeBranchName(branchName);
  const track = await findTrackByName(projectId, trackName);

  if (track) {
    await deleteTrack(track.id);
    // Same cascade behavior as PR cleanup
  }
}
```

## Webhook Events

### Event Subscriptions

The GitHub App must subscribe to these webhook events:

1. **`push`** (existing, enhanced)
   - Triggers: Branch push
   - Action: Check branch config, deploy if configured

2. **`pull_request`** (new)
   - Actions: `opened`, `synchronize`, `reopened`, `closed`
   - Triggers: PR opened, updated, or closed
   - Action: Deploy to `pr-{prNumber}` track or cleanup

3. **`delete`** (new)
   - Filter: `ref_type === 'branch'`
   - Triggers: Branch deleted
   - Action: Find and delete associated track

### GitHub App Permissions

Required permissions:
- **Repository contents**: Read (to clone code)
- **Pull requests**: Read & Write (to receive PR webhooks and update status)
- **Commit statuses**: Read & Write (future: deployment status on PRs)

## Migration

### Database Migration

```typescript
// drizzle/0xxx_add_branch_deployment_config.sql

CREATE TYPE "branch_deployment_config" AS ENUM ('none', 'pending', 'valid', 'error');

CREATE TABLE IF NOT EXISTS "branch_deployment_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "branch_name" text NOT NULL,
  "environment_id" uuid NOT NULL REFERENCES "environments"("id"),
  "auto_deploy_prs" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_branch_idx" ON "branch_deployment_config" ("project_id", "branch_name");
```

### Optional: Seed Production Configs

For existing projects, optionally create a branch config for the production branch:

```typescript
// Migration or manual script
const projects = await db.query.projectSchema.findMany({
  with: { githubConfig: true },
});

for (const project of projects) {
  if (!project.githubConfig) continue;

  const productionEnv = await getEnvironmentByName(project.id, "production");
  if (!productionEnv) continue;

  await addBranchConfig({
    projectId: project.id,
    branchName: project.githubConfig.productionBranchName,
    environmentId: productionEnv.id,
    autoDeployPRs: false, // Default to false for production branches
  });
}
```

## Future Work / TODOs

### Cleanup Enhancements

Currently, `deleteTrack` will:
- ✅ Delete track record
- ✅ Cascade delete domains
- ✅ Orphan deployments (set `trackId` to NULL)

**Future enhancements:**
- [ ] Delete S3 artifacts for orphaned deployments (configurable retention)
- [ ] Send webhook notifications on track cleanup
- [ ] Archive deployment records instead of orphaning them
- [ ] Add `deletedAt` timestamp for soft-delete pattern

### PR Deployment Features

- [ ] **GitHub status checks**: Post deployment URL to PR as a status check
- [ ] **Deployment comments**: Comment on PR with preview URL when ready
- [ ] **Auto-cleanup timer**: Delete PR tracks after N days of inactivity
- [ ] **Resource limits**: Limit number of concurrent PR deployments per project

### Branch Protection Integration

- [ ] Respect GitHub branch protection rules
- [ ] Block deployment if branch is protected and user lacks permissions
- [ ] Integrate with required status checks

### UI Enhancements

- [ ] Show deployment history per branch
- [ ] Quick-deploy button for configured branches
- [ ] Deployment status badges in branch config table
- [ ] Bulk operations (add multiple branches, delete multiple configs)

### Monitoring & Observability

- [ ] Track deployment frequency per branch
- [ ] Alert on failed branch deployments
- [ ] Dashboard showing active tracks and resource usage
- [ ] Cost tracking per branch/PR

## Testing Checklist

### Backend

- [ ] Unit tests for `branch-config.service.ts`
- [ ] Unit tests for sanitization logic
- [ ] Integration tests for webhook handlers
- [ ] Test PR open → deploy → close → cleanup flow
- [ ] Test branch push → deploy flow
- [ ] Test branch delete → cleanup flow
- [ ] Test edge cases (duplicate configs, invalid branch names)

### Frontend

- [ ] Test branch config CRUD operations
- [ ] Test form validation
- [ ] Test read-only production branch display
- [ ] Test empty state
- [ ] Test loading states
- [ ] Test error handling

### End-to-End

- [ ] Create branch config via UI
- [ ] Push to configured branch → verify deployment
- [ ] Open PR targeting configured branch → verify PR deployment
- [ ] Close PR → verify track cleanup
- [ ] Delete branch → verify track cleanup
- [ ] Remove branch config → verify no more auto-deploys

## Security Considerations

1. **Branch name injection**: Sanitization prevents malicious branch names from creating invalid DNS labels
2. **Webhook verification**: All webhook payloads must be verified with GitHub signature
3. **Authorization**: Only project members can configure branch auto-deploy
4. **Resource limits**: Consider limiting number of concurrent PR deployments to prevent abuse
5. **Secret isolation**: PR deployments use the target branch's environment (not source)

## Rollout Plan

### Phase 1: Branch Auto-Deploy (MVP)
- Implement database schema
- Implement branch config service
- Enhance `handlePushEvent`
- Implement TRPC router
- Implement frontend UI
- **Test with internal projects**

### Phase 2: PR Auto-Deploy
- Implement `handlePullRequestEvent`
- Subscribe to `pull_request` webhook
- **Test PR open/sync/close flows**

### Phase 3: Cleanup
- Implement `handleDeleteEvent`
- Subscribe to `delete` webhook
- **Test branch deletion cleanup**

### Phase 4: Polish & Production
- Add GitHub status checks
- Add monitoring/alerting
- Document user-facing features
- **Release to production**

## Open Questions

1. **Default environment for non-prod branches?**
   - Proposal: Default to `preview` environment
   - Allow configuration per branch

2. **Should removing a branch config also delete the track?**
   - Proposal: Add checkbox "Also delete track and deployments" (default: false)
   - Safer to keep deployments by default

3. **Limits on PR deployments?**
   - Proposal: Max 10 concurrent PR tracks per project (configurable)
   - Oldest PR tracks cleaned up first if limit exceeded

4. **Branch naming conflicts?**
   - Example: `feature/test` and `feature-test` both sanitize to `feature-test`
   - Proposal: Check for conflicts, reject second branch with error

5. **Production branch config immutable?**
   - Proposal: Production branch config cannot be deleted via UI
   - Must be changed via GitHub config settings (productionBranchName)

## Appendix

### Example Payloads

#### Push Event
```json
{
  "ref": "refs/heads/feature/auth",
  "head_commit": { "id": "abc123..." },
  "repository": { "id": 123456, "full_name": "org/repo" }
}
```

#### Pull Request Event (opened)
```json
{
  "action": "opened",
  "number": 344,
  "pull_request": {
    "number": 344,
    "head": { "sha": "def456...", "ref": "feature/auth" },
    "base": { "ref": "main" },
    "merged": false
  },
  "repository": { "id": 123456, "full_name": "org/repo" }
}
```

#### Delete Event
```json
{
  "ref": "feature/auth",
  "ref_type": "branch",
  "repository": { "id": 123456, "full_name": "org/repo" }
}
```

---

**End of RFC**
