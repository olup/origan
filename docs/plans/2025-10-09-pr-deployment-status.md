# RFC: PR Deployment Status and Comments

**Date:** 2025-10-09
**Status:** Draft
**Author:** System
**Depends on:** [2025-10-07-branch-and-pr-auto-deploy.md](./2025-10-07-branch-and-pr-auto-deploy.md)

## Overview

### Current State
- PRs targeting configured branches automatically deploy to `pr-{prNumber}` tracks
- Deployment status is only visible in the Origan admin dashboard
- No feedback is posted back to GitHub PR
- Developers must manually navigate to Origan to check deployment status
- No integration with GitHub's deployment/status check APIs

### Problem
Teams need visibility into PR deployment status directly within GitHub:
1. **Status visibility**: Developers should see deployment status in the PR without leaving GitHub
2. **Deployment URLs**: Preview URLs should be easily accessible from the PR
3. **CI/CD integration**: Deployment should appear as a required check that can block merges
4. **Failure feedback**: Build/deployment failures should be immediately visible in the PR

### Goals
1. Post GitHub deployment status for PR deployments (pending → in_progress → success/failure)
2. Comment on PR with deployment URL when successful
3. Update comment when PR is re-deployed (synchronize event)
4. Mark deployment as failed in GitHub when build/deployment fails
5. Support GitHub's deployment environments for branch protection rules

## Architecture

### GitHub APIs Used

#### 1. Deployments API (Chosen Approach)
Creates deployment records that show up in the PR and repository's deployment history.

```typescript
// Create deployment
POST /repos/{owner}/{repo}/deployments
{
  "ref": "abc123...",                 // Commit SHA to deploy
  "environment": "preview",           // Environment name
  "description": "Deploy PR #344",
  "auto_merge": false,
  "required_contexts": [],            // Skip status checks
  "production_environment": false
}

// Update deployment status
POST /repos/{owner}/{repo}/deployments/{deployment_id}/statuses
{
  "state": "pending" | "in_progress" | "success" | "failure",
  "log_url": "https://admin.origan.app/projects/my-proj/deployments/deploy-id",
  "description": "Building...",
  "environment_url": "https://pr-344--my-proj.origan.app",  // Only on success
  "auto_inactive": true
}
```

#### 2. Comments API
Post and update comments on the PR with deployment information.

```typescript
// Create comment
POST /repos/{owner}/{repo}/issues/{issue_number}/comments
{
  "body": "## 🚀 Deployment Successful\n\n..."
}

// Update comment
PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}
{
  "body": "## 🔄 Redeploying...\n\n..."
}
```

**Why Deployments API over Commit Statuses:**
- Native support for environments and deployment history
- Better integration with GitHub's UI (dedicated deployment section in PR)
- Can be used in branch protection rules
- More professional appearance
- Supports deployment URLs natively

## Database Schema

Following the existing `github_config` pattern, we create separate tables for GitHub PR integration. The naming explicitly shows these are PR-specific.

### Conceptual Model

```
PR #344
  ├─ track: pr-344
  │  └─ github_pr_track (pr_number: 344, comment_id: 999)
  │
  ├─ deployment 1 (first push)
  │  └─ github_pr_deployment (github_deployment_id: 111)
  │
  └─ deployment 2 (second push)
     └─ github_pr_deployment (github_deployment_id: 222)

Both deployments update the same comment (id: 999)
Each deployment has its own GitHub deployment status
```

### New Table: `github_pr_track`

Stores GitHub metadata **per track** (one PR = one track = one comment thread).

```typescript
export const githubPrTrackSchema = pgTable("github_pr_track", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Link to Origan track
  trackId: uuid("track_id")
    .references(() => trackSchema.id, { onDelete: "cascade" })
    .notNull()
    .unique(), // One GitHub PR config per track

  // GitHub PR metadata
  prNumber: integer("pr_number").notNull(),
  commentId: bigint("comment_id", { mode: "number" }), // NULL until first comment posted

  ...timestamps,
});
```

**Relations:**
```typescript
export const githubPrTrackRelations = relations(
  githubPrTrackSchema,
  ({ one }) => ({
    track: one(trackSchema, {
      fields: [githubPrTrackSchema.trackId],
      references: [trackSchema.id],
    }),
  })
);
```

### New Table: `github_pr_deployment`

Stores GitHub deployment ID **per deployment** (each push = new GitHub deployment).

```typescript
export const githubPrDeploymentSchema = pgTable("github_pr_deployment", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Link to Origan deployment
  deploymentId: uuid("deployment_id")
    .references(() => deploymentsSchema.id, { onDelete: "cascade" })
    .notNull()
    .unique(), // One GitHub deployment per Origan deployment

  // GitHub deployment metadata
  githubDeploymentId: bigint("github_deployment_id", { mode: "number" }).notNull(),

  ...timestamps,
});
```

**Relations:**
```typescript
export const githubPrDeploymentRelations = relations(
  githubPrDeploymentSchema,
  ({ one }) => ({
    deployment: one(deploymentsSchema, {
      fields: [githubPrDeploymentSchema.deploymentId],
      references: [deploymentsSchema.id],
    }),
  })
);
```

### Design Rationale

**Why separate tables following `github_config` pattern:**
- ✅ Consistent with existing architecture (`github_config` is separate from `project`)
- ✅ Clear separation of concerns (core vs. GitHub integration)
- ✅ Naming makes it obvious these are PR-specific
- ✅ Easy to query "all PR tracks" or "all PR deployments"
- ✅ Main tables (`track`, `deployments`) stay clean
- ✅ Can add more PR-specific metadata later without cluttering core tables

**Why `github_pr_track` is needed:**
- PR metadata persists across multiple deployments
- One comment is reused and updated for all deployments in the PR
- Stores PR number explicitly (no parsing needed)

**Why `github_pr_deployment` is needed:**
- Each deployment creates a new GitHub deployment (with unique status lifecycle)
- Allows updating GitHub status: pending → in_progress → success/failure
- Enables branch protection rules to block merges on failed deployments

## Backend Implementation

### Service Layer

#### `github-pr-deployment.service.ts` (New)

```typescript
import { Octokit } from "@octokit/rest";
import { eq } from "drizzle-orm";
import { getLogger } from "../libs/logger.js";
import { db } from "../libs/db/index.js";
import {
  githubPrTrackSchema,
  githubPrDeploymentSchema,
  deploymentsSchema,
} from "../libs/db/schema.js";
import { getGithubOctokit } from "./github.service.js";

/**
 * Create a GitHub deployment for a PR deployment
 */
export async function createGithubPrDeployment({
  deploymentId,
  trackId,
  prNumber,
  commitSha,
  environmentName,
  githubInstallationId,
  githubRepoFullName,
  projectReference,
}: {
  deploymentId: string;
  trackId: string;
  prNumber: number;
  commitSha: string;
  environmentName: string;
  githubInstallationId: number;
  githubRepoFullName: string;
  projectReference: string;
}) {
  const log = getLogger();
  const octokit = await getGithubOctokit(githubInstallationId);
  const [owner, repo] = githubRepoFullName.split("/");

  try {
    // Ensure github_pr_track exists for this track
    let githubPrTrack = await db.query.githubPrTrackSchema.findFirst({
      where: eq(githubPrTrackSchema.trackId, trackId),
    });

    if (!githubPrTrack) {
      [githubPrTrack] = await db
        .insert(githubPrTrackSchema)
        .values({
          trackId,
          prNumber,
          commentId: null,
        })
        .returning();

      log.info(`Created github_pr_track for PR #${prNumber}`);
    }

    // Create GitHub deployment
    const { data: githubDeployment } = await octokit.repos.createDeployment({
      owner,
      repo,
      ref: commitSha,
      environment: environmentName,
      description: `Deploy PR #${prNumber}`,
      auto_merge: false,
      required_contexts: [],
      production_environment: environmentName === "production",
    });

    log.info(
      `Created GitHub deployment ${githubDeployment.id} for PR #${prNumber}`
    );

    // Store GitHub deployment ID
    await db.insert(githubPrDeploymentSchema).values({
      deploymentId,
      githubDeploymentId: githubDeployment.id,
    });

    // Set initial status to pending
    await updateGithubPrDeploymentStatus({
      deploymentId,
      status: "pending",
      description: "Deployment queued",
      logUrl: getDeploymentLogUrl(projectReference, deploymentId),
    });
  } catch (error) {
    log.error(
      `Failed to create GitHub deployment for PR #${prNumber}:`,
      error
    );
    // Don't throw - GitHub integration failure shouldn't block deployment
  }
}

/**
 * Update GitHub deployment status
 */
export async function updateGithubPrDeploymentStatus({
  deploymentId,
  status,
  description,
  logUrl,
  environmentUrl,
}: {
  deploymentId: string;
  status: "pending" | "in_progress" | "success" | "failure";
  description: string;
  logUrl: string;
  environmentUrl?: string;
}) {
  const log = getLogger();

  const githubPrDeployment = await db.query.githubPrDeploymentSchema.findFirst({
    where: eq(githubPrDeploymentSchema.deploymentId, deploymentId),
    with: {
      deployment: {
        with: {
          project: {
            with: {
              githubConfig: {
                with: {
                  githubAppInstallation: true,
                },
              },
            },
          },
          track: {
            with: {
              githubPrTrack: true,
            },
          },
        },
      },
    },
  });

  if (!githubPrDeployment) {
    // Not a PR deployment with GitHub integration
    return;
  }

  const { deployment } = githubPrDeployment;
  const { githubConfig } = deployment.project;

  if (!githubConfig?.githubAppInstallation) {
    log.error(`No GitHub config found for project ${deployment.projectId}`);
    return;
  }

  const octokit = await getGithubOctokit(
    githubConfig.githubAppInstallation.githubInstallationId
  );
  const [owner, repo] = githubConfig.githubRepoFullName.split("/");

  try {
    // Update GitHub deployment status
    await octokit.repos.createDeploymentStatus({
      owner,
      repo,
      deployment_id: githubPrDeployment.githubDeploymentId,
      state: status,
      log_url: logUrl,
      description,
      environment_url: environmentUrl,
      auto_inactive: true,
    });

    log.info(
      `Updated GitHub deployment ${githubPrDeployment.githubDeploymentId} status to ${status}`
    );

    // Post or update comment on success/failure
    const githubPrTrack = deployment.track?.githubPrTrack;
    if (!githubPrTrack) {
      log.warn(`No github_pr_track found for deployment ${deploymentId}`);
      return;
    }

    if (status === "success" && environmentUrl) {
      await postOrUpdateDeploymentComment({
        githubPrTrack,
        octokit,
        owner,
        repo,
        environmentUrl,
        logUrl,
      });
    }

    if (status === "failure") {
      await postOrUpdateDeploymentComment({
        githubPrTrack,
        octokit,
        owner,
        repo,
        logUrl,
        failed: true,
      });
    }
  } catch (error) {
    log.error(
      `Failed to update GitHub deployment status for ${deploymentId}:`,
      error
    );
    // Don't throw - GitHub integration failure shouldn't break deployment
  }
}

/**
 * Post or update a comment on the PR with deployment info
 */
async function postOrUpdateDeploymentComment({
  githubPrTrack,
  octokit,
  owner,
  repo,
  environmentUrl,
  logUrl,
  failed = false,
}: {
  githubPrTrack: any;
  octokit: Octokit;
  owner: string;
  repo: string;
  environmentUrl?: string;
  logUrl: string;
  failed?: boolean;
}) {
  const log = getLogger();
  const prNumber = githubPrTrack.prNumber;

  const commentBody = failed
    ? generateFailureComment(logUrl)
    : generateSuccessComment(environmentUrl!, logUrl);

  try {
    if (githubPrTrack.commentId) {
      // Update existing comment
      await octokit.issues.updateComment({
        owner,
        repo,
        comment_id: githubPrTrack.commentId,
        body: commentBody,
      });
      log.info(`Updated comment ${githubPrTrack.commentId} on PR #${prNumber}`);
    } else {
      // Create new comment
      const { data: comment } = await octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: commentBody,
      });

      // Store comment ID on github_pr_track
      await db
        .update(githubPrTrackSchema)
        .set({
          commentId: comment.id,
          updatedAt: new Date(),
        })
        .where(eq(githubPrTrackSchema.id, githubPrTrack.id));

      log.info(`Created comment ${comment.id} on PR #${prNumber}`);
    }
  } catch (error) {
    log.error(`Failed to post comment on PR #${prNumber}:`, error);
    // Don't throw - comment failure shouldn't break deployment
  }
}

/**
 * Generate success comment markdown
 */
function generateSuccessComment(environmentUrl: string, logUrl: string): string {
  const timestamp = new Date().toISOString();
  return `## 🚀 Deployment Successful

Your preview deployment is ready!

**🔗 Preview URL:** ${environmentUrl}

**📊 Deployment Details:** [View logs](${logUrl})

**⏰ Last updated:** ${timestamp}

---
*Deployed by [Origan](https://origan.app)*`;
}

/**
 * Generate failure comment markdown
 */
function generateFailureComment(logUrl: string): string {
  const timestamp = new Date().toISOString();
  return `## ❌ Deployment Failed

The deployment for this PR has failed.

**📊 View logs:** [See what went wrong](${logUrl})

**⏰ Last updated:** ${timestamp}

---
*Deployed by [Origan](https://origan.app)*`;
}

/**
 * Generate Origan deployment log URL
 */
function getDeploymentLogUrl(projectReference: string, deploymentId: string): string {
  const baseUrl = process.env.ADMIN_URL || "https://admin.origan.app";
  return `${baseUrl}/projects/${projectReference}/deployments/${deploymentId}`;
}

/**
 * Clean up GitHub deployment when PR is closed
 */
export async function cleanupGithubPrDeployment(deploymentId: string) {
  const log = getLogger();

  const githubPrDeployment = await db.query.githubPrDeploymentSchema.findFirst({
    where: eq(githubPrDeploymentSchema.deploymentId, deploymentId),
    with: {
      deployment: {
        with: {
          project: {
            with: {
              githubConfig: {
                with: {
                  githubAppInstallation: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!githubPrDeployment) {
    return;
  }

  const { deployment } = githubPrDeployment;
  const { githubConfig } = deployment.project;

  if (!githubConfig?.githubAppInstallation) {
    return;
  }

  const octokit = await getGithubOctokit(
    githubConfig.githubAppInstallation.githubInstallationId
  );
  const [owner, repo] = githubConfig.githubRepoFullName.split("/");

  try {
    // Mark deployment as inactive
    await octokit.repos.createDeploymentStatus({
      owner,
      repo,
      deployment_id: githubPrDeployment.githubDeploymentId,
      state: "inactive",
      description: "PR closed",
      auto_inactive: false,
    });

    log.info(
      `Marked GitHub deployment ${githubPrDeployment.githubDeploymentId} as inactive`
    );
  } catch (error) {
    log.error(
      `Failed to cleanup GitHub deployment ${githubPrDeployment.githubDeploymentId}:`,
      error
    );
    // Don't throw - cleanup failure shouldn't break PR close flow
  }
}
```

### Integration Points

#### 1. Enhanced `handlePullRequestEvent` in `github.service.ts`

```typescript
export async function handlePullRequestEvent(
  payload: z.infer<typeof PullRequestEventPayloadSchema>
) {
  // ... existing code ...

  // Handle PR open/sync/reopen
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

  const trackName = `pr-${prNumber}`;

  // Trigger build and get deployment + track
  const { deployment, track } = await triggerBuildTask(
    project.id,
    sourceBranch,
    headSha,
    trackName,
    branchConfig.environmentId
  );

  // Create GitHub deployment (non-blocking)
  await createGithubPrDeployment({
    deploymentId: deployment.id,
    trackId: track.id,
    prNumber,
    commitSha: headSha,
    environmentName: branchConfig.environment.name,
    githubInstallationId: githubConfigWithProject.githubAppInstallation.githubInstallationId,
    githubRepoFullName: repository.full_name,
    projectReference: project.reference,
  });
}
```

#### 2. Enhanced `cleanupPRTrack` in `github.service.ts`

```typescript
async function cleanupPRTrack(projectId: string, prNumber: number) {
  const log = getLogger();
  const trackName = `pr-${prNumber}`;

  const track = await findTrackByName(projectId, trackName);
  if (!track) {
    log.info(`No track found for PR #${prNumber}`);
    return;
  }

  // Find all deployments for this track
  const deployments = await db.query.deploymentsSchema.findMany({
    where: eq(deploymentsSchema.trackId, track.id),
  });

  // Clean up GitHub deployments
  for (const deployment of deployments) {
    await cleanupGithubPrDeployment(deployment.id);
  }

  log.info(`Deleting track ${track.id} for PR #${prNumber}`);
  await deleteTrack(track.id);
}
```

#### 3. Build Task Lifecycle Hooks

Hook into the build/deployment lifecycle to update GitHub status:

```typescript
// In build/manager.ts or build/runner.ts

/**
 * Called when build starts
 */
export async function onBuildStart(deployment: { id: string; projectId: string }) {
  const projectReference = await getProjectReference(deployment.projectId);

  await updateGithubPrDeploymentStatus({
    deploymentId: deployment.id,
    status: "in_progress",
    description: "Building application",
    logUrl: getDeploymentLogUrl(projectReference, deployment.id),
  });
}

/**
 * Called when build succeeds and deployment is live
 */
export async function onDeploymentSuccess(
  deployment: { id: string; projectId: string },
  deploymentUrl: string
) {
  const projectReference = await getProjectReference(deployment.projectId);

  await updateGithubPrDeploymentStatus({
    deploymentId: deployment.id,
    status: "success",
    description: "Deployment complete",
    logUrl: getDeploymentLogUrl(projectReference, deployment.id),
    environmentUrl: deploymentUrl,
  });
}

/**
 * Called when build fails
 */
export async function onBuildFailure(
  deployment: { id: string; projectId: string },
  error: Error
) {
  const projectReference = await getProjectReference(deployment.projectId);

  await updateGithubPrDeploymentStatus({
    deploymentId: deployment.id,
    status: "failure",
    description: `Build failed: ${error.message}`,
    logUrl: getDeploymentLogUrl(projectReference, deployment.id),
  });
}
```

## GitHub App Configuration

### Required Permissions

Add to existing permissions:
- **Deployments**: Read & Write
- **Pull requests**: Read & Write (already required)
- **Issues**: Read & Write (for comments)

### Webhook Events

Already subscribed from previous RFC:
- ✅ `pull_request` (opened, synchronize, reopened, closed)

No new webhook events needed.

## User Experience

### GitHub PR View

#### 1. Deployment Status Section
Shows up in the PR's "Checks" tab and deployment section:

```
Deployments
-----------
preview (origan)          ✓ Active
  └─ pr-344--my-proj.origan.app

Deployed at 2:34 PM
View deployment logs →
```

#### 2. Comment on PR

**Success:**
```markdown
## 🚀 Deployment Successful

Your preview deployment is ready!

🔗 Preview URL: https://pr-344--my-proj.origan.app

📊 Deployment Details: View logs

⏰ Last updated: 2025-10-09T14:34:22Z

---
Deployed by Origan
```

**Failure:**
```markdown
## ❌ Deployment Failed

The deployment for this PR has failed.

📊 View logs: See what went wrong

⏰ Last updated: 2025-10-09T14:34:22Z

---
Deployed by Origan
```

#### 3. Status on Commits

Each commit shows deployment status:
```
✓ origan/deployment — Deployment successful
  View deployment
```

### Branch Protection Integration

Optionally require deployment to succeed before merging:

**Repository Settings → Branches → Branch protection rules:**
- ✅ Require status checks to pass before merging
  - ✅ `origan/deployment` (environment: preview)

## Migration

### Database Migration

```sql
-- drizzle/0xxx_add_github_pr_integration.sql

-- Table for GitHub PR track metadata (one per PR track)
CREATE TABLE IF NOT EXISTS "github_pr_track" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "track_id" uuid NOT NULL REFERENCES "track"("id") ON DELETE CASCADE UNIQUE,
  "pr_number" integer NOT NULL,
  "comment_id" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "github_pr_track_track_id_idx"
  ON "github_pr_track" ("track_id");

CREATE INDEX IF NOT EXISTS "github_pr_track_pr_number_idx"
  ON "github_pr_track" ("pr_number");

-- Table for GitHub PR deployment metadata (one per deployment)
CREATE TABLE IF NOT EXISTS "github_pr_deployment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deployment_id" uuid NOT NULL REFERENCES "deployments"("id") ON DELETE CASCADE UNIQUE,
  "github_deployment_id" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "github_pr_deployment_deployment_id_idx"
  ON "github_pr_deployment" ("deployment_id");

CREATE INDEX IF NOT EXISTS "github_pr_deployment_github_deployment_id_idx"
  ON "github_pr_deployment" ("github_deployment_id");
```

### Backfill Strategy

No backfill needed. Existing PR deployments (if any) will not have GitHub integration. Only new PR deployments after this feature is deployed will create these records.

## Error Handling

### GitHub API Failures

```typescript
try {
  await createGithubPrDeployment(...);
} catch (error) {
  log.error("Failed to create GitHub deployment:", error);
  // Continue with Origan deployment anyway
  // Don't block deployment if GitHub integration fails
}
```

**Principle:** GitHub integration failures should NEVER block actual deployments. Log errors but continue.

### Rate Limiting

GitHub API has rate limits:
- **GitHub App**: 5,000 requests per hour per installation
- **Secondary rate limit**: Max 100 concurrent requests

**Mitigation:**
- Use exponential backoff for retries
- Queue GitHub API calls if necessary
- Monitor rate limit headers
- Log rate limit consumption

### Comment Update Conflicts

If multiple deployments happen rapidly (e.g., force push):
1. First deployment creates comment and stores `commentId` in `github_pr_track`
2. Subsequent deployments reuse the same `commentId` from `github_pr_track`
3. Comments show "Last updated" timestamp to reflect latest deployment

## Testing Checklist

### Backend
- [ ] Unit tests for `github-pr-deployment.service.ts`
- [ ] Test GitHub API error handling (don't block deployments)
- [ ] Test rate limit handling
- [ ] Test comment creation and updates
- [ ] Test deployment status transitions (pending → in_progress → success)
- [ ] Test failure scenario (build fails → GitHub shows failure)
- [ ] Test cleanup on PR close (deployment marked inactive)
- [ ] Test `github_pr_track` creation and reuse

### Integration
- [ ] Open PR → verify GitHub deployment created with "pending" status
- [ ] Build starts → verify status updates to "in_progress"
- [ ] Build succeeds → verify status updates to "success" and comment posted
- [ ] Build fails → verify status updates to "failure" and failure comment posted
- [ ] Synchronize PR (new commit) → verify comment updates with new timestamp
- [ ] Close PR → verify all GitHub deployments marked inactive
- [ ] Multiple rapid pushes → verify comment updates correctly

### GitHub UI
- [ ] Verify deployment appears in PR's "Deployments" section
- [ ] Verify deployment URL is clickable and correct
- [ ] Verify logs link works
- [ ] Verify comment formatting looks good
- [ ] Verify timestamps update correctly
- [ ] Verify branch protection integration (if enabled)
- [ ] Verify multiple deployments show up as separate events with same comment

## Security Considerations

1. **GitHub App Token Security**: Installation access tokens are short-lived (1 hour), refresh as needed
2. **Comment Content**: All comment content is controlled by us (no user input injection risk)
3. **URL Validation**: Ensure deployment URLs and log URLs are properly formatted
4. **Rate Limit DoS**: Monitor for potential abuse triggering many deployments
5. **Permission Scoping**: Only request GitHub permissions actually needed
6. **Non-blocking failures**: Never expose sensitive error details in GitHub comments

## Rollout Plan

### Phase 1: Core Integration (Week 1)
- ✅ Add database tables (`github_pr_track`, `github_pr_deployment`)
- ✅ Implement `github-pr-deployment.service.ts`
- ✅ Hook into PR webhook handler
- ✅ Test with internal project
- ✅ Verify deployments created correctly

### Phase 2: Lifecycle Hooks (Week 1-2)
- ✅ Hook into build start event
- ✅ Hook into build success event
- ✅ Hook into build failure event
- ✅ Test status transitions
- ✅ Verify error handling

### Phase 3: Comments & Polish (Week 2)
- ✅ Implement comment posting
- ✅ Implement comment updates
- ✅ Refine comment formatting
- ✅ Test rapid re-deployments
- ✅ Add monitoring

### Phase 4: Production (Week 2-3)
- ✅ Deploy to production
- ✅ Monitor GitHub API usage
- ✅ Monitor error rates
- ✅ Gather user feedback
- ✅ Document feature for users

## Monitoring & Observability

### Metrics to Track
- Number of GitHub deployments created per day
- GitHub API error rate (should be < 1%)
- GitHub API calls per hour (track rate limit usage)
- Comment post success rate (should be > 95%)
- Average time from deployment creation to "success" status
- Rate limit utilization percentage

### Alerts
- **Critical**: GitHub API error rate > 5%
- **Warning**: Rate limit approaching (> 80% utilization)
- **Warning**: Comment post failures > 10% of attempts
- **Info**: First GitHub deployment for new project

### Logging
Log all GitHub API interactions with structured data:

```typescript
log.info("GitHub API call", {
  action: "create_deployment",
  prNumber,
  deploymentId,
  githubDeploymentId,
  status: "success",
  duration_ms: 234,
});
```

## Future Enhancements

### Phase 5: Enhanced Features
- [ ] **Multi-domain support**: List all domains in comment if track has multiple
- [ ] **Build time tracking**: Show build duration in comment
- [ ] **Deployment history**: Show previous deployment info in comment
- [ ] **Environment badges**: Add visual badges to comments
- [ ] **Manual redeploy**: Support comment commands like `/origan redeploy`

### Phase 6: Advanced Integration
- [ ] **GitHub Actions integration**: Trigger deployments from workflows
- [ ] **Custom deployment contexts**: Support multiple deployment types per PR (e.g., storybook, docs)
- [ ] **Deployment protection rules**: Integrate with GitHub's deployment approvals
- [ ] **Slack/Discord notifications**: Mirror deployment status to chat tools
- [ ] **Screenshot previews**: Capture and post screenshots of deployed site

## Open Questions

1. **Should we support manual re-deploys via comment commands?**
   - Example: Comment `/origan deploy` to trigger re-deployment
   - Requires parsing `issue_comment` webhook events
   - **Proposal**: Add in Phase 5 if users request it

2. **Should we show build logs inline in the comment?**
   - Pros: Faster debugging without leaving GitHub
   - Cons: Can be very long, clutters comment, may contain sensitive info
   - **Proposal**: Link to logs only (current approach)

3. **Should we support multiple environments per PR?**
   - Example: Both `preview` and `storybook` environments for same PR
   - Would require multiple GitHub deployments per PR
   - **Proposal**: Start with single environment, add later if needed

4. **Should we delete the comment when PR is closed?**
   - Pros: Cleaner PR history
   - Cons: Loses deployment history for reference
   - **Proposal**: Keep comment, optionally update to show "Deployment inactive"

5. **Should we update the comment while build is in progress?**
   - Could add "🔄 Deploying..." header while build in progress
   - Then update to success/failure when complete
   - **Proposal**: Only post comment on final status (success/failure)

## Appendix

### Example GitHub API Responses

#### Create Deployment Response
```json
{
  "id": 1234567890,
  "node_id": "DE_kwDOAA...",
  "sha": "abc123...",
  "ref": "feature/auth",
  "environment": "preview",
  "description": "Deploy PR #344",
  "creator": {
    "login": "origan-bot[bot]",
    "type": "Bot"
  },
  "created_at": "2025-10-09T14:30:00Z",
  "updated_at": "2025-10-09T14:30:00Z"
}
```

#### Deployment Status Response
```json
{
  "id": 9876543210,
  "state": "success",
  "description": "Deployment complete",
  "environment_url": "https://pr-344--my-proj.origan.app",
  "log_url": "https://admin.origan.app/projects/my-proj/deployments/deploy-123",
  "created_at": "2025-10-09T14:34:22Z",
  "deployment_url": "https://api.github.com/repos/org/repo/deployments/1234567890"
}
```

#### Comment Response
```json
{
  "id": 555666777,
  "node_id": "IC_kwDOAA...",
  "url": "https://api.github.com/repos/org/repo/issues/comments/555666777",
  "html_url": "https://github.com/org/repo/pull/344#issuecomment-555666777",
  "body": "## 🚀 Deployment Successful\n\n...",
  "user": {
    "login": "origan-bot[bot]",
    "type": "Bot"
  },
  "created_at": "2025-10-09T14:34:25Z",
  "updated_at": "2025-10-09T14:34:25Z"
}
```

### Comment Update Flow

```
1. PR #344 opened
   ├─ Create track: pr-344
   ├─ Create github_pr_track (pr_number: 344, comment_id: NULL)
   ├─ Create deployment #1
   ├─ Create github_pr_deployment (github_deployment_id: 111)
   ├─ Status: pending → in_progress → success
   └─ Create comment (id: 999), store in github_pr_track

2. PR #344 updated (synchronize)
   ├─ Reuse track: pr-344
   ├─ Reuse github_pr_track (pr_number: 344, comment_id: 999)
   ├─ Create deployment #2
   ├─ Create github_pr_deployment (github_deployment_id: 222)
   ├─ Status: pending → in_progress → success
   └─ Update comment (id: 999) with new timestamp

3. PR #344 closed
   ├─ Mark github_pr_deployment #1 as inactive
   ├─ Mark github_pr_deployment #2 as inactive
   ├─ Delete track (cascades to github_pr_track)
   └─ Comment remains for history
```

### Data Flow Diagram

```
GitHub PR Event
    ↓
handlePullRequestEvent()
    ↓
triggerBuildTask()
    ├─ Create deployment
    └─ Create/reuse track
    ↓
createGithubPrDeployment()
    ├─ Create/reuse github_pr_track
    ├─ Create github_pr_deployment
    ├─ Call GitHub API: create deployment
    └─ Update status: pending
    ↓
Build lifecycle hooks
    ├─ onBuildStart() → status: in_progress
    ├─ onDeploymentSuccess() → status: success
    │   └─ postOrUpdateDeploymentComment()
    │       ├─ Create comment (first time)
    │       └─ Update comment (subsequent times)
    └─ onBuildFailure() → status: failure
        └─ postOrUpdateDeploymentComment()
```

---

**End of RFC**
