import { hc } from "hono/client";
import type { ApiType } from "../../../control-api/src/routers/index.js";
import { config } from "../config.js";

import { getAccessToken } from "../services/auth.service.js";

// Base client for unauthenticated requests (login, refresh token, etc)
export const baseClient = hc<ApiType>(config.apiUrl);

/**
 * Create an authenticated client instance with the current access token
 */
export async function getAuthenticatedClient() {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("No token found - please login first");
  }
  return hc<ApiType>(config.apiUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
