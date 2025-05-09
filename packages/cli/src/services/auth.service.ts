import { z } from "zod";
import { baseClient, getAuthenticatedClient } from "../libs/client.js";
import { log } from "../utils/logger.js";
import { clearTokens, readTokens, saveTokens } from "../utils/token.js";

// Polling interval for checking auth status (3 seconds)
const POLLING_INTERVAL = 3000;

/**
 * Initialize device flow authentication
 */
async function initializeDeviceFlow() {
  const response = await baseClient.auth.cli.session.initialize.$post();
  const data = await response.json();
  return data;
}

/**
 * Poll for session completion
 */
async function pollSession(sessionId: string) {
  while (true) {
    const response = await baseClient.auth.cli.session[":id"].$get({
      param: { id: sessionId },
    });
    const data = await response.json();

    if ("error" in data) {
      throw new Error(data.error);
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
async function refreshTokens(currentRefreshToken: string) {
  try {
    const response = await baseClient.auth["refresh-token"].$post({
      headers: {
        Cookie: `refreshToken=${currentRefreshToken}`,
      },
    });
    const data = await response.json();

    if ("error" in data || !data.accessToken || !data.refreshToken) {
      return null;
    }

    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    };
  } catch (_error) {
    return null;
  }
}

/**
 * Start the login flow
 */
export async function login(): Promise<void> {
  try {
    // Initialize device flow and get login URL
    const { sessionId, loginUrl } = await initializeDeviceFlow();

    // Display login instructions
    log.info("\nTo login with origan cli, visit this URL in your browser:");
    log.color("cyanBright", loginUrl);
    log.info("\nWaiting for authentication to complete...\n");

    // Poll for completion
    const tokens = await pollSession(sessionId);

    // Save tokens
    await saveTokens(tokens);

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
    const client = await getAuthenticatedClient();
    const response = await client.auth.me.$get();
    const data = await response.json();
    if ("error" in data) {
      log.error(`Error fetching user info: ${data.error}`);
      process.exit(1);
    }

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
    if (newTokens) {
      // Save both new tokens
      await saveTokens(newTokens);
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
