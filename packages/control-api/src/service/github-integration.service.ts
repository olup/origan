import { eq } from "drizzle-orm";
import { env } from "../config.js";
import { getLogger } from "../instrumentation.js";
import { db } from "../libs/db/index.js";
import {
  deploymentGithubIntegrationSchema,
  deploymentSchema,
} from "../libs/db/schema.js";
import { githubAppInstance } from "../libs/github.js";

/**
 * Create deployment_github_integration record
 * Called immediately when GitHub webhook triggers deployment
 */
export async function createGithubIntegrationRecord({
  deploymentId,
  commitSha,
  branch,
  prNumber,
}: {
  deploymentId: string;
  commitSha: string;
  branch: string;
  prNumber?: number;
}) {
  const log = getLogger();

  try {
    await db.insert(deploymentGithubIntegrationSchema).values({
      deploymentId,
      checkRunId: null,
      commitSha,
      branch,
      prNumber: prNumber ?? null,
    });

    log.info(
      `Created GitHub integration record for deployment ${deploymentId}`,
    );
  } catch (error) {
    log
      .withError(error)
      .error(`Failed to create GitHub integration record for ${deploymentId}`);
    // Don't throw - this shouldn't block deployment
  }
}

/**
 * Generate Origan deployment URL
 */
function getDeploymentUrl(deployment: {
  reference: string;
  project: { reference: string };
}): string {
  return `${env.ORIGAN_ADMIN_PANEL_URL}/projects/${deployment.project.reference}/deployments/${deployment.reference}`;
}

/**
 * Create GitHub check run and store the check run ID
 */
export async function createGithubCheckRun(deploymentId: string) {
  const log = getLogger();

  try {
    // Get deployment with GitHub integration data
    const deployment = await db.query.deploymentSchema.findFirst({
      where: eq(deploymentSchema.id, deploymentId),
      with: {
        project: {
          with: {
            githubConfig: {
              with: { githubAppInstallation: true },
            },
          },
        },
        githubIntegration: true,
      },
    });

    if (!deployment?.githubIntegration) {
      return; // Not a GitHub deployment
    }

    const { commitSha, branch, prNumber } = deployment.githubIntegration;
    const githubConfig = deployment.project.githubConfig;

    if (!githubConfig?.githubAppInstallation) {
      log.error(`No GitHub config for project ${deployment.projectId}`);
      return;
    }

    // Get authenticated Octokit
    const octokit = await githubAppInstance.getInstallationOctokit(
      githubConfig.githubAppInstallation.githubInstallationId,
    );

    const [owner, repo] = githubConfig.githubRepositoryFullName.split("/");

    // Create check run
    const { data: checkRun } = await octokit.request(
      "POST /repos/{owner}/{repo}/check-runs",
      {
        owner,
        repo,
        name: "Origan Deployment",
        head_sha: commitSha,
        status: "queued",
        details_url: getDeploymentUrl(deployment),
        output: {
          title: "Deployment queued",
          summary: prNumber
            ? `Deployment for PR #${prNumber} from branch \`${branch}\` has been queued.`
            : `Deployment for branch \`${branch}\` has been queued.`,
        },
      },
    );

    // Update integration record with check run ID
    await db
      .update(deploymentGithubIntegrationSchema)
      .set({ checkRunId: String(checkRun.id) })
      .where(eq(deploymentGithubIntegrationSchema.deploymentId, deploymentId));

    log.info(
      `Created GitHub check run ${checkRun.id} for deployment ${deploymentId}`,
    );
  } catch (error) {
    log
      .withError(error)
      .error(`Failed to create GitHub check for deployment ${deploymentId}`);
    // Don't throw
  }
}

/**
 * Update GitHub check run to "in_progress" status
 */
export async function updateGithubCheckToInProgress(deploymentId: string) {
  const log = getLogger();

  try {
    // Get deployment with GitHub integration
    const deployment = await db.query.deploymentSchema.findFirst({
      where: eq(deploymentSchema.id, deploymentId),
      with: {
        project: {
          with: {
            githubConfig: {
              with: { githubAppInstallation: true },
            },
          },
        },
        githubIntegration: true,
      },
    });

    if (!deployment?.githubIntegration?.checkRunId) {
      return; // No GitHub check run for this deployment
    }

    const { checkRunId, branch, prNumber } = deployment.githubIntegration;
    const githubConfig = deployment.project.githubConfig;

    if (!githubConfig?.githubAppInstallation) {
      return;
    }

    const octokit = await githubAppInstance.getInstallationOctokit(
      githubConfig.githubAppInstallation.githubInstallationId,
    );

    const [owner, repo] = githubConfig.githubRepositoryFullName.split("/");

    await octokit.request(
      "PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}",
      {
        owner,
        repo,
        check_run_id: Number(checkRunId),
        status: "in_progress",
        details_url: getDeploymentUrl(deployment),
        output: {
          title: "Building deployment",
          summary: prNumber
            ? `Building deployment for PR #${prNumber} from branch \`${branch}\`.`
            : `Building deployment for branch \`${branch}\`.`,
        },
      },
    );

    log.info(
      `Updated GitHub check run ${checkRunId} to in_progress for deployment ${deploymentId}`,
    );
  } catch (error) {
    log
      .withError(error)
      .error(
        `Failed to update GitHub check to in_progress for deployment ${deploymentId}`,
      );
  }
}

/**
 * Update GitHub check run to "completed" status with success
 */
export async function updateGithubCheckToSuccess(deploymentId: string) {
  const log = getLogger();

  try {
    // Get deployment with GitHub integration and domains
    const deployment = await db.query.deploymentSchema.findFirst({
      where: eq(deploymentSchema.id, deploymentId),
      with: {
        project: {
          with: {
            githubConfig: {
              with: { githubAppInstallation: true },
            },
          },
        },
        githubIntegration: true,
        domains: true,
      },
    });

    if (!deployment?.githubIntegration?.checkRunId) {
      return;
    }

    const { checkRunId, branch, prNumber } = deployment.githubIntegration;
    const githubConfig = deployment.project.githubConfig;

    if (!githubConfig?.githubAppInstallation) {
      return;
    }

    const octokit = await githubAppInstance.getInstallationOctokit(
      githubConfig.githubAppInstallation.githubInstallationId,
    );

    const [owner, repo] = githubConfig.githubRepositoryFullName.split("/");

    // Build deployment URLs list
    const deploymentUrls = deployment.domains.map((d) => `https://${d.name}`);
    const urlsList =
      deploymentUrls.length > 0
        ? deploymentUrls.map((url) => `- ${url}`).join("\n")
        : "- _No URLs configured_";

    const prContext = prNumber
      ? `**PR #${prNumber}** from branch \`${branch}\``
      : `**Branch:** \`${branch}\``;

    await octokit.request(
      "PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}",
      {
        owner,
        repo,
        check_run_id: Number(checkRunId),
        status: "completed",
        conclusion: "success",
        details_url: getDeploymentUrl(deployment),
        output: {
          title: "Deployment successful",
          summary: `## ✅ Deployment Successful\n\n${prContext}\n\nYour deployment is live at:\n${urlsList}\n\n[View deployment details →](${getDeploymentUrl(deployment)})`,
        },
      },
    );

    log.info(
      `Updated GitHub check run ${checkRunId} to success for deployment ${deploymentId}`,
    );
  } catch (error) {
    log
      .withError(error)
      .error(
        `Failed to update GitHub check to success for deployment ${deploymentId}`,
      );
  }
}

/**
 * Update GitHub check run to "completed" status with failure
 */
export async function updateGithubCheckToFailure(
  deploymentId: string,
  errorMessage?: string,
) {
  const log = getLogger();

  try {
    // Get deployment with GitHub integration
    const deployment = await db.query.deploymentSchema.findFirst({
      where: eq(deploymentSchema.id, deploymentId),
      with: {
        project: {
          with: {
            githubConfig: {
              with: { githubAppInstallation: true },
            },
          },
        },
        githubIntegration: true,
      },
    });

    if (!deployment?.githubIntegration?.checkRunId) {
      return;
    }

    const { checkRunId, branch, prNumber } = deployment.githubIntegration;
    const githubConfig = deployment.project.githubConfig;

    if (!githubConfig?.githubAppInstallation) {
      return;
    }

    const octokit = await githubAppInstance.getInstallationOctokit(
      githubConfig.githubAppInstallation.githubInstallationId,
    );

    const [owner, repo] = githubConfig.githubRepositoryFullName.split("/");

    const prContext = prNumber
      ? `**PR #${prNumber}** from branch \`${branch}\``
      : `**Branch:** \`${branch}\``;

    const errorDetails = errorMessage ? `\n\n**Error:** ${errorMessage}` : "";

    await octokit.request(
      "PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}",
      {
        owner,
        repo,
        check_run_id: Number(checkRunId),
        status: "completed",
        conclusion: "failure",
        details_url: getDeploymentUrl(deployment),
        output: {
          title: "Deployment failed",
          summary: `## ❌ Deployment Failed\n\n${prContext}${errorDetails}\n\n[View detailed logs →](${getDeploymentUrl(deployment)})`,
        },
      },
    );

    log.info(
      `Updated GitHub check run ${checkRunId} to failure for deployment ${deploymentId}`,
    );
  } catch (error) {
    log
      .withError(error)
      .error(
        `Failed to update GitHub check to failure for deployment ${deploymentId}`,
      );
  }
}
