import type { App } from "@octokit/app";
import type { RestEndpointMethodTypes } from "@octokit/rest";
import { eq } from "drizzle-orm";
import { db } from "../libs/db/index.js";
import { userSchema } from "../libs/db/schema.js";
import { githubAppInstance } from "../libs/github.js";

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
  try {
    await db
      .update(userSchema)
      .set({ githubAppInstallationId: installationId })
      .where(eq(userSchema.githubProviderReference, githubAccountId));

    console.log(
      `GitHub App installed: ${installationId} for account ${githubAccountId}`,
    );
  } catch (dbError) {
    console.error("Database error updating user installation ID:", dbError);
    throw dbError;
  }
}

type HandleInstallationDeletedProps = {
  installationId: number;
  githubAccountId: string;
};

export async function handleInstallationDeleted({
  githubAccountId,
  installationId,
}: HandleInstallationDeletedProps) {
  try {
    await db
      .update(userSchema)
      .set({ githubAppInstallationId: null })
      .where(eq(userSchema.githubProviderReference, githubAccountId));
    console.log(
      `Removed installation ID for user with GitHub account ID ${githubAccountId}`,
    );
  } catch (dbError) {
    console.error("Database error removing user installation ID:", dbError);
    throw dbError;
  }
}

export async function getRepoById(
  installationId: number,
  githubRepositoryId: number,
): Promise<RepoResponse["data"] | null> {
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
    console.error(
      `Failed to fetch repository by ID ${githubRepositoryId}:`,
      error,
    );
    return null;
  }
}

export async function getRepoBranches(
  installationId: number,
  githubRepositoryId: number,
) {
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
    console.error(`Failed to fetch branches for ${githubRepositoryId}:`, error);
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
