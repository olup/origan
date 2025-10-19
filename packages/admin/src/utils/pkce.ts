/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth flow
 */

/**
 * Generate a random code verifier (43-128 characters)
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

/**
 * Generate code challenge from verifier using SHA-256
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64URLEncode(new Uint8Array(hash));
}

/**
 * Base64-URL encode without padding
 */
function base64URLEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Store code verifier in sessionStorage
 */
export function storeCodeVerifier(verifier: string): void {
  sessionStorage.setItem("pkce_code_verifier", verifier);
}

/**
 * Retrieve code verifier from sessionStorage
 */
export function getCodeVerifier(): string | null {
  return sessionStorage.getItem("pkce_code_verifier");
}

/**
 * Clear code verifier from sessionStorage
 */
export function clearCodeVerifier(): void {
  sessionStorage.removeItem("pkce_code_verifier");
}

/**
 * Store code verifier in cookie for OAuth callback
 */
export function storeCodeVerifierInCookie(verifier: string): void {
  // Store for 10 minutes (enough for OAuth flow)
  const expires = new Date(Date.now() + 10 * 60 * 1000).toUTCString();
  // biome-ignore lint/suspicious/noDocumentCookie: needed for PKCE flow, cookie read by backend
  document.cookie = `code_verifier=${verifier}; expires=${expires}; path=/; secure; samesite=lax`;
}
