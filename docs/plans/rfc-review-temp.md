# RFC Reviews (2025-10-09)

## Branch and PR Auto-Deploy (`docs/plans/2025-10-07-branch-and-pr-auto-deploy.md`)

Findings
- The RFC destructures `{ deployment, track }` from `triggerBuildTask` but the service currently returns only IDs, so this call will throw unless the return shape is expanded (`docs/plans/2025-10-07-branch-and-pr-auto-deploy.md:243` + `packages/control-api/src/service/build/manager.ts:25`).
- Passing `environmentId` into `triggerBuildTask` will not change the environment a build uses because the implementation still derives env vars from `trackName === "prod" ? "production" : "preview"`; the plan needs to rework that logic or per-branch environments will silently still deploy with preview variables (`docs/plans/2025-10-07-branch-and-pr-auto-deploy.md:243` + `packages/control-api/src/service/build/manager.ts:118`).
- `sanitizeBranchName` lowercases, strips underscores and truncates to 63 chars, so distinct branch names like `feature_Fix` and `feature-fix` or long names clipped to the same prefix will collide on track/domain creation (`docs/plans/2025-10-07-branch-and-pr-auto-deploy.md:186` + `packages/control-api/src/service/track.service.ts:13`).
- The migration creates an enum named `branch_deployment_config` and then a table with the same identifier, but no column uses that enum, so Drizzle will fail to generate types and Postgres rejects duplicate names (`docs/plans/2025-10-07-branch-and-pr-auto-deploy.md:1055`).
- The UI hard-codes environment options to production/preview even though projects can define additional environments, so users cannot map a branch to custom envs (`docs/plans/2025-10-07-branch-and-pr-auto-deploy.md:842` + `packages/control-api/src/service/environment.service.ts:1`).

Open Questions
- How do we prevent sanitized name collisions (hash suffix, per-project uniqueness checks, or storing the raw branch in the track record)?
- Should `deleteTrack` also trigger any external-domain / certificate cleanup for branch tracks (`packages/control-api/src/service/track.service.ts:54`)?

## Control API Service Layer Refactor (`docs/plans/2025-10-07-control-api-service-layer-refactor.md`)

Findings
- The proposed `lookup.service.ts` duplicates helpers we already expose in `organization.service.ts` and `project.service.ts`; better to reuse and extend those than add another layer (`docs/plans/2025-10-07-control-api-service-layer-refactor.md:98` + `packages/control-api/src/service/organization.service.ts:33` + `packages/control-api/src/service/project.service.ts:61`).
- When extracting the auth router we must keep hashing semantics for refresh tokens; the RFC should call that out explicitly to avoid accidentally storing raw tokens (`docs/plans/2025-10-07-control-api-service-layer-refactor.md:98` + `packages/control-api/src/trpc/routers/auth.ts:63`).

Open Questions
- Which routers still need direct `db` access for lightweight lookups (e.g. GitHub install discovery), and how will those be handled under the proposed lint rule?

## PR Deployment Status and Comments (`docs/plans/2025-10-09-pr-deployment-status.md`)

Findings
- `triggerBuildTask` does not return `deployment` or `track`, so destructuring it in the webhook handler will throw; the service must be updated or the RFC should expect the current `{ buildId, deploymentId }` payload (`docs/plans/2025-10-09-pr-deployment-status.md:608` + `packages/control-api/src/service/build/manager.ts:207`).
- The RFC relies on `getGithubOctokit` but that helper does not exist today, so the plan needs to define it (or reuse `githubAppInstance.getInstallationOctokit`) to compile (`docs/plans/2025-10-09-pr-deployment-status.md:211` + `packages/control-api/src/service/github.service.ts:1`).
- Storing GitHub IDs as `bigint(..., { mode: "number" })` risks precision loss for large comment/deployment IDs; we should persist them as strings (`docs/plans/2025-10-09-pr-deployment-status.md:120`).
- Inserts into `github_pr_track` / `github_pr_deployment` lack conflict handling, so concurrent redeploys can explode on unique constraints; add `onConflict` guards or transactions (`docs/plans/2025-10-09-pr-deployment-status.md:245`).
- `getDeploymentLogUrl` uses `process.env.ADMIN_URL`, but our config already exposes `env.ORIGAN_ADMIN_PANEL_URL`; using a second env var will break environments where only the existing setting is present (`docs/plans/2025-10-09-pr-deployment-status.md:512` + `packages/control-api/src/config.ts:8`).
- The rollout assumes `onBuildStart` / `onDeploymentSuccess` hooks exist, but build status updates currently flow through the NATS consumer and never call these helpers; the integration plan needs to plug into `BuildEventsDatabaseConsumer` instead (`docs/plans/2025-10-09-pr-deployment-status.md:640` + `packages/control-api/src/service/build/events-consumer.ts:158`).

Open Questions
- How should we recover if GitHub deletes the saved comment ID (e.g. user manually removes it)?
- Should track cleanup also wipe the associated branch deployment config to prevent orphaned rows?
