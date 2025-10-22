import { eq } from "drizzle-orm";
import { env } from "../../config.js";
import { getLogger } from "../../instrumentation.js";
import { db } from "../../libs/db/index.js";
import {
  buildSchema,
  deploymentSchema,
  projectSchema,
} from "../../libs/db/schema.js";
import {
  generateReference,
  REFERENCE_PREFIXES,
} from "../../utils/reference.js";
import type { ResourceLimits } from "../../utils/task.js";
import { triggerTask } from "../../utils/task.js";
import { generateDeployToken, hashToken } from "../../utils/token.js";
import { initiateDeployment } from "../deployment.service.js";
import {
  getEnvironmentById,
  getLatestRevision,
} from "../environment.service.js";
import { generateGitHubInstallationToken } from "../github.service.js";
import type { BranchRuleResolution } from "../github-branch-rule.service.js";
import { resolveBranchRule } from "../github-branch-rule.service.js";
import {
  createGithubCheckRun,
  createGithubIntegrationRecord,
} from "../github-integration.service.js";

type TriggerBuildTaskOptions = {
  ruleResolution?: BranchRuleResolution | null;
  triggerSource: "integration.github" | "cli" | "api";
  githubMetadata?: {
    commitSha: string;
    branch: string;
    prNumber?: number;
  };
};

export async function triggerBuildTask(
  projectId: string,
  branchName: string,
  commitSha: string,
  options: TriggerBuildTaskOptions,
) {
  const log = getLogger();
  log.info(
    `Attempting to trigger build task for project ${projectId}, branch ${branchName}, commit ${commitSha}`,
  );

  const project = await db.query.projectSchema.findFirst({
    where: eq(projectSchema.id, projectId),
    with: {
      githubConfig: {
        with: {
          githubAppInstallation: true,
        },
      },
    },
  });

  if (!project) {
    log.error(`BUILD SERVICE: Project not found for project ID ${projectId}.`);
    return { error: "Project not found" };
  }

  if (!project.githubConfig) {
    log.error(`GitHub configuration not found for project ID ${projectId}.`);
    return { error: "GitHub configuration not found for project" };
  }

  const githubConfig = project.githubConfig;

  if (!githubConfig?.githubAppInstallation?.githubInstallationId) {
    log.error(`GitHub App Installation not found for project ${projectId}.`);
    return { error: "GitHub App Installation not found for project" };
  }

  const resolvedRule =
    options.ruleResolution ?? (await resolveBranchRule(projectId, branchName));

  if (!resolvedRule) {
    log.info(
      `No branch rule matched for project ${projectId} and branch ${branchName}. Skipping deployment creation.`,
    );
    return { error: "No matching branch rule" };
  }

  let githubToken: string;
  try {
    githubToken = await generateGitHubInstallationToken(
      githubConfig.githubAppInstallation.githubInstallationId,
      githubConfig.githubRepositoryId,
    );
    if (!githubToken) {
      throw new Error("Failed to generate GitHub token, received undefined.");
    }
  } catch (error) {
    log
      .withError(error)
      .error(`Failed to generate GitHub token for project ${projectId}`);
    throw new Error("Failed to generate GitHub token for project user");
  }

  const buildReference = generateReference(10, REFERENCE_PREFIXES.BUILD);

  const deployToken = generateDeployToken();
  const [build] = await db
    .insert(buildSchema)
    .values({
      projectId,
      branch: branchName,
      commitSha,
      reference: buildReference,
      status: "pending",
      logs: [],
      deployToken: hashToken(deployToken),
    })
    .returning();

  if (!build) {
    log.error("Failed to create build record");
    throw new Error("Failed to create build record");
  }

  const trackName = resolvedRule.trackName;

  const initiateDeploymentResult = await initiateDeployment({
    projectRef: project.reference,
    buildId: build.id,
    trackName,
    environmentId: resolvedRule.rule.environmentId,
    isSystemTrack: resolvedRule.rule.isPrimary,
    triggerSource: options.triggerSource,
  });

  // Create GitHub integration record and check run if triggered by GitHub
  if (
    options.triggerSource === "integration.github" &&
    options.githubMetadata
  ) {
    await createGithubIntegrationRecord({
      deploymentId: initiateDeploymentResult.deployment.id,
      commitSha: options.githubMetadata.commitSha,
      branch: options.githubMetadata.branch,
      prNumber: options.githubMetadata.prNumber,
    });

    await createGithubCheckRun(initiateDeploymentResult.deployment.id);
  }

  // Get environment variables for the build
  let buildEnvVars: Record<string, string> = {};
  try {
    const environment = resolvedRule.rule.environmentId
      ? await getEnvironmentById(resolvedRule.rule.environmentId)
      : null;

    if (environment) {
      const latestRevision = await getLatestRevision(environment.id);
      if (latestRevision?.variables) {
        buildEnvVars = latestRevision.variables as Record<string, string>;
        log.info(
          `Found ${Object.keys(buildEnvVars).length} environment variables for ${environment.name}`,
        );
      }
    }
  } catch (error) {
    log.warn(`Failed to fetch environment variables: ${error}`);
    // Continue build without environment variables
  }

  // Build task
  try {
    const buildResourceLimits: ResourceLimits = {
      cpu: "1",
      memory: "2Gi",
      cpuRequests: "500m",
      memoryRequests: "1Gi",
      timeoutSeconds: 3600,
    };

    const buildRunnerEnv = {
      BUILD_ID: build.id,
      GITHUB_TOKEN: githubToken,
      REPO_FULL_NAME: githubConfig.githubRepositoryFullName,
      COMMIT_SHA: build.commitSha,
      BRANCH: build.branch,
      PROJECT_ROOT_PATH: githubConfig.projectRootPath,
      EVENTS_NATS_SERVER: env.EVENTS_NATS_SERVER,
      EVENTS_NATS_NKEY_CREDS: env.EVENTS_NATS_NKEY_CREDS || "",
      DEPLOY_TOKEN: deployToken,
      CONTROL_API_URL: env.ORIGAN_API_URL,
      ...(Object.keys(buildEnvVars).length > 0 && {
        BUILD_ENV: JSON.stringify(buildEnvVars),
      }),
    };

    const imageName = env.BUILDER_IMAGE;

    await triggerTask({
      taskId: build.id,
      imageName,
      env: buildRunnerEnv,
      namePrefix: "builder",
      resources: buildResourceLimits,
    });
  } catch (error) {
    log
      .withError(error)
      .error(`Failed to trigger build task for build ${build.id}`);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error triggering build task";

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: "error" as const,
      message: `Failed to trigger build task: ${errorMessage}`,
    };

    await db
      .update(buildSchema)
      .set({
        status: "failed",
        logs: [logEntry],
      })
      .where(eq(buildSchema.id, build.id));

    await db
      .update(deploymentSchema)
      .set({
        status: "error",
      })
      .where(eq(deploymentSchema.id, initiateDeploymentResult.deployment.id));

    return {
      buildId: build.id,
      deploymentId: initiateDeploymentResult.deployment.id,
      buildReference,
      error: errorMessage,
    };
  }

  return {
    buildId: build.id,
    buildReference,
    deploymentId: initiateDeploymentResult.deployment.id,
  };
}
