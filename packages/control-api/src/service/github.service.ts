import type { App } from "@octokit/app";
import type { RestEndpointMethodTypes } from "@octokit/rest";
import { eq } from "drizzle-orm";
import { getLogger } from "../instrumentation.js";
import { db } from "../libs/db/index.js";
import { githubConfigSchema, userSchema } from "../libs/db/schema.js";
import { githubAppInstance } from "../libs/github.js";
import { triggerBuildTask } from "./build/index.js";

// We will use an undocumented BUT solidly production ready endpoint of the gh api. See https://github.com/octokit/octokit.js/issues/163
// As such we'll transfer the documented endpoint types
type RepoResponse = RestEndpointMethodTypes["repos"]["get"]["response"];

export type AppOctokit = Awaited<
  ReturnType<InstanceType<typeof App>["getInstallationOctokit"]>
>;
type HandleInstallationCreatedProps = {
  installationId: number;
  githubAccountId: string;
};
export async function handleInstallationCreated({
  installationId,
  githubAccountId,
}: HandleInstallationCreatedProps) {
  const log = getLogger();

  try {
    await db
      .update(userSchema)
      .set({ githubAppInstallationId: installationId })
      .where(eq(userSchema.githubProviderReference, githubAccountId));

    log.info(
      `GitHub App installed: ${installationId} for account ${githubAccountId}`,
    );
  } catch (dbError) {
    log
      .withError(dbError)
      .error("Database error updating user installation ID");
    throw dbError;
  }
}

type HandleInstallationDeletedProps = {
  installationId: number;
  githubAccountId: string;
};

export async function handleInstallationDeleted({
  githubAccountId,
}: HandleInstallationDeletedProps) {
  const log = getLogger();

  try {
    await db
      .update(userSchema)
      .set({ githubAppInstallationId: null })
      .where(eq(userSchema.githubProviderReference, githubAccountId));
    log.info(
      `Removed installation ID for user with GitHub account ID ${githubAccountId}`,
    );
  } catch (dbError) {
    log
      .withError(dbError)
      .error("Database error removing user installation ID");
    throw dbError;
  }
}

export async function getRepoById(
  installationId: number,
  githubRepositoryId: number,
): Promise<RepoResponse["data"] | null> {
  const log = getLogger();

  if (!installationId || !githubRepositoryId) {
    throw new Error("Installation ID and Repository ID are required.");
  }

  try {
    const octokit =
      await githubAppInstance.getInstallationOctokit(installationId);

    // undocumented but reliable endpoint
    const response = (await octokit.request("GET /repositories/{id}", {
      id: githubRepositoryId,
    })) as RepoResponse;

    return response.data;
  } catch (error) {
    log
      .withError(error)
      .error(`Failed to fetch repository by ID ${githubRepositoryId}`);
    return null;
  }
}

export async function getRepoBranches(
  installationId: number,
  githubRepositoryId: number,
) {
  const log = getLogger();

  try {
    const repo = await getRepoById(installationId, githubRepositoryId);
    if (!repo) {
      throw new Error(`Repository with ID ${githubRepositoryId} not found.`);
    }
    const octokit =
      await githubAppInstance.getInstallationOctokit(installationId);

    const branchesReponse = await octokit.request(
      "GET /repos/{owner}/{repo}/branches",
      {
        owner: repo.owner.login,
        repo: repo.name,
      },
    );
    return branchesReponse.data;
  } catch (error) {
    log
      .withError(error)
      .error(`Failed to fetch branches for ${githubRepositoryId}`);
    return [];
  }
}

export async function listInstallationRepositories(installationId: number) {
  if (!installationId) {
    throw new Error("Installation ID is required.");
  }

  try {
    const octokit =
      await githubAppInstance.getInstallationOctokit(installationId);

    const response = await octokit.request("GET /installation/repositories");

    return response.data.repositories;
  } catch (error) {
    throw new Error(
      `Failed to list repositories for installation ID ${installationId}`,
      { cause: error },
    );
  }
}

// TODO: this is triggered by a webhook from github
// Duplicated calls may happen - it should be made idempotent
export async function handlePushEvent(payload: {
  ref: string;
  head_commit: {
    id: string;
  };
  repository: {
    id: number;
    full_name: string;
  };
}) {
  const log = getLogger();

  log.info(
    `Handling push event for repository: ${payload.repository.full_name}, ref: ${payload.ref}`,
  );

  const branchName = payload.ref.replace("refs/heads/", "");
  const commitSha = payload.head_commit.id;
  const githubRepositoryId = payload.repository.id;

  try {
    const githubConfigWithProject = await db.query.githubConfigSchema.findFirst(
      {
        where: eq(githubConfigSchema.githubRepositoryId, githubRepositoryId),
        with: {
          project: {
            with: {
              user: true,
            },
          },
        },
      },
    );

    if (!githubConfigWithProject || !githubConfigWithProject.project) {
      log.info(
        `No project or GitHub configuration found for repository ID ${githubRepositoryId}.`,
      );
      return;
    }

    // TODO : for now, only the main production branch is auto deployed
    if (branchName !== githubConfigWithProject.productionBranchName) {
      log.info(
        `Push to non-production branch "${branchName}" for project ${githubConfigWithProject.project.name}. No build triggered.`,
      );
      return;
    }

    log.info(
      `Push to production branch "${branchName}" for project ${githubConfigWithProject.project.name}. Triggering build for commit ${commitSha}.`,
    );

    const buildReference = await triggerBuildTask(
      githubConfigWithProject.project.id,
      branchName,
      commitSha,
    );

    return buildReference;
  } catch (error) {
    log
      .withError(error)
      .error(
        `Error handling push event for repository ${payload.repository.full_name}`,
      );
  }
}

export async function generateGitHubInstallationToken(
  installationId: number,
  repositoryId?: number,
): Promise<string> {
  const log = getLogger();

  try {
    const octokit =
      await githubAppInstance.getInstallationOctokit(installationId);
    const tokenResponse = await octokit.request(
      "POST /app/installations/{installation_id}/access_tokens",
      {
        installation_id: installationId,
        repository_ids: repositoryId ? [repositoryId] : undefined,
      },
    );
    return tokenResponse.data.token;
  } catch (error) {
    log
      .withError(error)
      .error(
        `Failed to generate GitHub installation token for installation ID ${installationId} and repository ID ${repositoryId}`,
      );
    throw new Error(
      "Could not generate GitHub installation token.withError(error).",
    );
  }
}
