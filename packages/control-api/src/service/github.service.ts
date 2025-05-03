import type { InstallationEvent } from "@octokit/webhooks-types";
import { eq } from "drizzle-orm";
import { db } from "../libs/db/index.js";
import { userSchema } from "../libs/db/schema.js";

type HandleInstallationCreatedProps = {
  installationId: number;
  githubAccountId: string;
};
export async function handleInstallationCreated({
  installationId,
  githubAccountId,
}: HandleInstallationCreatedProps) {
  console.log(
    `GitHub App installed: ${installationId} for account ${githubAccountId}`,
  );

  try {
    await db
      .update(userSchema)
      .set({ githubAppInstallationId: installationId })
      .where(eq(userSchema.githubProviderReference, githubAccountId));
    console.log(
      `Updated user with GitHub account ID ${githubAccountId} with installation ID ${installationId}`,
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
  console.log(
    `GitHub App uninstalled: ${installationId} for account ${githubAccountId}`,
  );

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
