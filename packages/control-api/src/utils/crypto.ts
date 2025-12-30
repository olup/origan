import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Unified cryptographic utilities for token hashing.
 *
 * Two hashing strategies:
 *
 * 1. Salted hashing (hashTokenWithSalt/verifyTokenWithSalt):
 *    - For tokens verified AFTER fetching by a different identifier (e.g., build ID)
 *    - Each hash is unique, prevents rainbow tables
 *    - Example: deploy tokens (fetched by buildId, then verified)
 *
 * 2. Lookup hashing (hashTokenForLookup):
 *    - For tokens that must be looked up directly in the database
 *    - Deterministic: same input = same hash (required for WHERE clause)
 *    - Example: refresh tokens (looked up by hash)
 */

const SALT_LENGTH = 16;
const SALTED_HASH_SEPARATOR = ":";

/**
 * Generates a cryptographically secure random token.
 * @param bytes Number of random bytes (default: 32, produces 64 hex chars)
 */
export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

// =============================================================================
// SALTED HASHING - For tokens verified after fetching by another identifier
// =============================================================================

/**
 * Creates a salted SHA-256 hash of a token.
 * Use when the token will be fetched by a different identifier (e.g., build ID).
 *
 * @param token The plaintext token to hash
 * @returns Hash in format "salt:hash" for storage
 */
export function hashTokenWithSalt(token: string): string {
  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const hash = createHash("sha256").update(salt).update(token).digest("hex");
  return `${salt}${SALTED_HASH_SEPARATOR}${hash}`;
}

/**
 * Verifies a token against a salted hash.
 *
 * @param token The plaintext token to verify
 * @param storedHash The stored hash in "salt:hash" format
 * @returns True if the token matches
 */
export function verifyTokenWithSalt(
  token: string,
  storedHash: string,
): boolean {
  const separatorIndex = storedHash.indexOf(SALTED_HASH_SEPARATOR);
  if (separatorIndex === -1) {
    return false;
  }

  const salt = storedHash.slice(0, separatorIndex);
  const expectedHash = storedHash.slice(separatorIndex + 1);

  const computedHash = createHash("sha256")
    .update(salt)
    .update(token)
    .digest("hex");

  return timingSafeCompare(computedHash, expectedHash);
}

// =============================================================================
// LOOKUP HASHING - For tokens looked up directly by hash in database
// =============================================================================

/**
 * Creates a deterministic SHA-256 hash for database lookups.
 * Use when the token must be found via WHERE tokenHash = ?.
 *
 * @param token The plaintext token to hash
 * @returns Hex-encoded hash for storage/lookup
 */
export function hashTokenForLookup(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// =============================================================================
// Internal helpers
// =============================================================================

function timingSafeCompare(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}
