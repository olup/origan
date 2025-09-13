import { trpc } from "../libs/trpc-client.js";
import { log } from "../utils/logger.js";
import { readTokens, saveTokens } from "../utils/token.js";

export async function getUserOrganizations() {
  try {
    return await trpc.organizations.list.query();
  } catch (error) {
    log.error(
      "Failed to fetch organizations:",
      error instanceof Error ? error.message : "Unknown error",
    );
    throw error;
  }
}

export async function getCurrentOrganization(): Promise<{
  reference: string;
} | null> {
  const tokens = await readTokens();
  if (!tokens?.currentOrganizationRef) {
    return null;
  }

  return {
    reference: tokens.currentOrganizationRef,
  };
}

export async function setCurrentOrganization(org: {
  reference: string;
}): Promise<void> {
  const tokens = await readTokens();
  if (!tokens) {
    throw new Error("No authentication tokens found");
  }

  await saveTokens({
    ...tokens,
    currentOrganizationRef: org.reference,
  });
}
