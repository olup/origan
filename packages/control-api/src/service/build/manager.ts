import { eq, sql } from "drizzle-orm";
import { env } from "../../config.js";
import { getLogger } from "../../instrumentation.js";
import { db } from "../../libs/db/index.js";
import { buildSchema, projectSchema } from "../../libs/db/schema.js";
import { generateReference } from "../../utils/reference.js";
import type { ResourceLimits } from "../../utils/task.js";
import { triggerTask } from "../../utils/task.js";
import { generateDeployToken, hashToken } from "../../utils/token.js";
import { generateGitHubInstallationToken } from "../github.service.js";
import type { BuildLogEntry } from "./types.js";

export async function triggerBuildTask(
  projectId: string,
  branch: string,
  commitSha: string,
) {
  const log = getLogger();
  log.info(
    `Attempting to trigger build task for project ${projectId}, branch ${branch}, commit ${commitSha}`,
  );

  const project = await db.query.projectSchema.findFirst({
    where: eq(projectSchema.id, projectId),
    with: {
      githubConfig: true,
      user: true,
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

  if (!project.user?.githubAppInstallationId) {
    log.error(
      `GitHub App Installation ID not found for user associated with project ${projectId}.`,
    );
    return { error: "GitHub App Installation ID not found for project user" };
  }

  let githubToken: string;
  try {
    githubToken = await generateGitHubInstallationToken(
      project.user.githubAppInstallationId,
      project.githubConfig.githubRepositoryId,
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

  const buildReference = `bld-${generateReference()}`;

  const deployToken = generateDeployToken();
  const [build] = await db
    .insert(buildSchema)
    .values({
      projectId,
      branch,
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
      REPO_FULL_NAME: project.githubConfig.githubRepositoryFullName,
      COMMIT_SHA: build.commitSha,
      BRANCH: build.branch,
      EVENTS_NATS_SERVER: env.EVENTS_NATS_SERVER,
      EVENTS_NATS_NKEY_CREDS: env.EVENTS_NATS_NKEY_CREDS || "",
      DEPLOY_TOKEN: deployToken,
      CONTROL_API_URL:
        env.APP_ENV === "production"
          ? "http://control-api"
          : "http://control-api:9999",
    };

    const imageName = env.BUILD_RUNNER_IMAGE;

    await triggerTask({
      taskId: build.id,
      imageName,
      env: buildRunnerEnv,
      namePrefix: "build-runner",
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

    await db
      .update(buildSchema)
      .set({
        status: "failed",
        updatedAt: new Date().toISOString(),
        logs: sql`jsonb_build_array(${JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "error",
          message: `Failed to trigger build task: ${errorMessage}`,
        } as BuildLogEntry)})`,
      })
      .where(eq(buildSchema.id, build.id));

    return {
      buildId: build.id,
      buildReference,
      error: errorMessage,
    };
  }

  return {
    buildId: build.id,
    buildReference,
  };
}

export async function getBuildByReference(reference: string) {
  const log = getLogger();
  try {
    const build = await db.query.buildSchema.findFirst({
      where: eq(buildSchema.reference, reference),
      with: {
        project: {
          with: {
            user: true,
          },
        },
      },
    });

    return build;
  } catch (error) {
    log.withError(error).error(`Error fetching build ${reference}`);
    throw error;
  }
}

export async function getProjectBuilds(reference: string, userId: string) {
  const log = getLogger();
  try {
    const project = await db.query.projectSchema.findFirst({
      where: eq(projectSchema.reference, reference),
    });

    if (!project) {
      throw new Error(`Project ${reference} not found`);
    }

    const builds = await db.query.buildSchema.findMany({
      where: eq(buildSchema.projectId, project.id),
      with: {
        project: {
          with: {
            user: true,
          },
        },
        deployment: {
          with: {
            hosts: {
              columns: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: (builds) => [sql`${builds.createdAt} DESC`],
    });

    if (!builds.length || builds[0].project.userId !== userId) {
      return [];
    }

    return builds.map((build) => {
      const protocol = env.APP_ENV === "production" ? "https" : "http";
      const buildDeploymentHost = build.deployment?.hosts[0]?.name;
      const buildUrl = buildDeploymentHost
        ? `${protocol}://${buildDeploymentHost}${env.ORIGAN_DEPLOY_DOMAIN}`
        : null;

      return {
        ...build,
        buildUrl,
      };
    });
  } catch (error) {
    log
      .withError(error)
      .error(`Error fetching builds for project ${reference}`);
    throw error;
  }
}
