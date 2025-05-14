import { eq, sql } from "drizzle-orm";
import { env } from "../../config.js";
import { db } from "../../libs/db/index.js";
import { buildSchema, projectSchema } from "../../libs/db/schema.js";
import type { ResourceLimits } from "../../utils/task.js";
import { triggerTask } from "../../utils/task.js";
import { generateGitHubInstallationToken } from "../github.service.js";
import type { BuildLogEntry } from "./types.js";

export async function triggerBuildTask(
  projectId: string,
  branch: string,
  commitSha: string
) {
  console.log(
    `Attempting to trigger build task for project ${projectId}, branch ${branch}, commit ${commitSha}`
  );

  const project = await db.query.projectSchema.findFirst({
    where: eq(projectSchema.id, projectId),
    with: {
      githubConfig: true,
      user: true,
    },
  });

  if (!project) {
    console.error(
      `BUILD SERVICE: Project not found for project ID ${projectId}.`
    );
    return { error: "Project not found" };
  }

  if (!project.githubConfig) {
    console.error(
      `GitHub configuration not found for project ID ${projectId}.`
    );
    return { error: "GitHub configuration not found for project" };
  }

  if (!project.user?.githubAppInstallationId) {
    console.error(
      `GitHub App Installation ID not found for user associated with project ${projectId}.`
    );
    return { error: "GitHub App Installation ID not found for project user" };
  }

  let githubToken: string;
  try {
    githubToken = await generateGitHubInstallationToken(
      project.user.githubAppInstallationId,
      project.githubConfig.githubRepositoryId
    );
    if (!githubToken) {
      throw new Error("Failed to generate GitHub token, received undefined.");
    }
  } catch (error) {
    console.error(
      `Failed to generate GitHub token for project ${projectId}:`,
      error
    );
    throw new Error("Failed to generate GitHub token for project user");
  }

  const buildReference = `build-${Date.now()}`;

  const [build] = await db
    .insert(buildSchema)
    .values({
      projectId,
      branch,
      commitSha,
      reference: buildReference,
      status: "pending",
      logs: [],
    })
    .returning();

  if (!build) {
    console.error("Failed to create build record");
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
    console.error(`Failed to trigger build task for build ${build.id}:`, error);
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

export async function getBuildById(buildId: string) {
  try {
    const build = await db.query.buildSchema.findFirst({
      where: eq(buildSchema.id, buildId),
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
    console.error(`Error fetching build ${buildId}:`, error);
    throw error;
  }
}
