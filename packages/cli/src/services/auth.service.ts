import { z } from "zod";
import { trpc } from "../libs/trpc-client.js";
import { log } from "../utils/logger.js";
import { clearTokens, readTokens, saveTokens } from "../utils/token.js";
import {
  getUserOrganizations,
  setCurrentOrganization,
} from "./organization.service.js";

// Polling interval for checking auth status (3 seconds)
const POLLING_INTERVAL = 3000;

type SessionTokens = {
  accessToken: string;
  refreshToken: string;
};

type InitializeSessionResponse = {
  sessionId: string;
  authUrl: string;
  expiresIn: number;
};

/**
 * Initialize device flow authentication
 */
async function initializeDeviceFlow(): Promise<InitializeSessionResponse> {
  const data = await trpc.auth.initializeCLISession.mutate();

  if (!data) {
    throw new Error("Failed to initialize CLI session");
  }

  return data;
}

/**
 * Poll for session completion
 */
async function pollSession(sessionId: string): Promise<SessionTokens> {
  while (true) {
    const data = await trpc.auth.checkCLISession.query({ sessionId });

    if (!data) {
      throw new Error("Session not found or expired");
    }

    if (data.status === "completed") {
      return data.tokens;
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));
  }
}

/**
 * Attempt to refresh the tokens
 */
async function refreshTokens(
  currentRefreshToken: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  try {
    const data = await trpc.auth.refreshTokenCLI.mutate({
      refreshToken: currentRefreshToken,
    });

    if (!data) {
      return null;
    }

    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    };
  } catch (error) {
    log.error(
      "Failed to refresh token:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return null;
  }
}

/**
 * Start the login flow
 */
export async function login(): Promise<void> {
  try {
    // Initialize device flow and get login URL
    const { sessionId, authUrl } = await initializeDeviceFlow();

    // Display login instructions
    log.info("\nTo login with origan cli, visit this URL in your browser:");
    log.color("cyanBright", authUrl);
    log.info("\nWaiting for authentication to complete...\n");

    // Poll for completion
    const tokens = await pollSession(sessionId);

    if (!tokens?.accessToken || !tokens?.refreshToken) {
      throw new Error("Failed to retrieve authentication tokens.");
    }

    // Save tokens
    await saveTokens({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });

    // Fetch user's organizations and set the first one as current
    try {
      const orgs = await getUserOrganizations();
      if (orgs.length > 0) {
        await setCurrentOrganization({
          reference: orgs[0].reference,
        });
      }
    } catch (error) {
      log.error(
        "Failed to fetch organizations:",
        error instanceof Error ? error.message : "Unknown error",
      );
    }

    log.success("Successfully logged in!");
  } catch (error) {
    log.error(
      "Login failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    process.exit(1);
  }
}

export async function whoami(): Promise<void> {
  try {
    const data = await trpc.auth.me.query();
    log.success(JSON.stringify(data, null, 2));
  } catch (error) {
    log.error(
      "Error fetching user info:",
      error instanceof Error ? error.message : "Unknown error",
    );
    process.exit(1);
  }
}

/**
 * Log out and clear stored credentials
 */
export async function logout(): Promise<void> {
  try {
    await clearTokens();
    log.success("Successfully logged out");
  } catch (error) {
    log.error(
      "Logout failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    process.exit(1);
  }
}

/**
 * Check if the user is currently authenticated
 */
export async function checkAuthStatus(): Promise<boolean> {
  try {
    const tokens = await readTokens();
    if (!tokens) {
      return false;
    }

    // If access token exists, we consider them logged in
    // The token's validity will be checked on actual API calls
    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * Get the current access token, refreshing if needed
 */
export async function getAccessToken(): Promise<string | null> {
  const tokens = await readTokens();
  if (!tokens || !tokens.accessToken) {
    return null;
  }
  // Check if access token is expired by decoding it
  const payloadRaw = JSON.parse(
    Buffer.from(tokens.accessToken.split(".")[1], "base64").toString("utf-8"),
  );
  const payload = z
    .object({
      exp: z.number(),
    })
    .parse(payloadRaw);

  const expiresAt = payload.exp * 1000; // Convert to milliseconds

  if (Date.now() >= expiresAt) {
    // Token is expired, attempt to refresh
    const newTokens = await refreshTokens(tokens.refreshToken);
    if (newTokens?.accessToken) {
      // Preserve organization info when refreshing tokens
      const currentTokens = await readTokens();
      if (currentTokens?.currentOrganizationRef) {
        await saveTokens({
          ...newTokens,
          currentOrganizationRef: currentTokens.currentOrganizationRef,
        });
      } else {
        await saveTokens(newTokens);
      }
      return newTokens.accessToken;
    }

    // If refresh fails, clear tokens and return null
    await clearTokens();
    log.error("Failed to refresh access token. Please log in again.");
    return null;
  }

  // Token is valid, return it
  return tokens.accessToken;
}
