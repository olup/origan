import { createHash, randomBytes } from "node:crypto";

/**
 * Generates a random deploy token
 * @returns A random token string (hex-encoded)
 */
export function generateDeployToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Creates a secure hash of a token with a unique random salt
 * @param token The token to hash
 * @returns A string in the format "salt:hash"
 */
export function hashToken(token: string): string {
  // Generate a unique salt for this token
  const salt = randomBytes(16).toString("hex");

  // Create hash using the salt
  const hash = createHash("sha256").update(token).update(salt).digest("hex");

  // Return in salt:hash format
  return `${salt}:${hash}`;
}

/**
 * Verifies a provided token against a stored hash
 * @param providedToken The raw token to verify
 * @param storedValue The stored "salt:hash" value
 * @returns True if the token is valid
 */
export function verifyToken(
  providedToken: string,
  storedValue: string,
): boolean {
  // Extract the salt and hash from the stored value
  const parts = storedValue.split(":");

  // Verify we have both salt and hash
  if (parts.length !== 2) {
    return false;
  }

  const [salt, storedHash] = parts;

  // Compute the hash of the provided token with the same salt
  const computedHash = createHash("sha256")
    .update(providedToken)
    .update(salt)
    .digest("hex");

  // Compare the computed hash with the stored hash
  return computedHash === storedHash;
}
