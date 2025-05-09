import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// Path to auth file in user's home directory
const CONFIG_DIR =
  process.env.XDG_CONFIG_HOME ||
  (process.platform === "win32"
    ? process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
    : path.join(os.homedir(), ".config"));

const AUTH_DIR = path.join(CONFIG_DIR, "origan");
const AUTH_FILE = path.join(AUTH_DIR, "auth.json");

/**
 * Ensure the auth directory exists
 */
async function ensureAuthDir() {
  try {
    await fs.mkdir(AUTH_DIR, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create auth directory: ${error}`);
  }
}

/**
 * Save authentication tokens to disk
 */
export async function saveTokens(tokens: AuthTokens): Promise<void> {
  await ensureAuthDir();
  await fs.writeFile(AUTH_FILE, JSON.stringify(tokens, null, 2));
}

/**
 * Read authentication tokens from disk
 */
export async function readTokens(): Promise<AuthTokens | null> {
  try {
    const data = await fs.readFile(AUTH_FILE, "utf-8");
    return JSON.parse(data) as AuthTokens;
  } catch (_error) {
    return null;
  }
}

/**
 * Clear stored authentication tokens
 */
export async function clearTokens(): Promise<void> {
  try {
    await fs.unlink(AUTH_FILE);
  } catch (_error) {
    // Ignore errors if file doesn't exist
  }
}
