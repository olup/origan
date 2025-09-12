import { hc } from "hono/client";
import type { ApiType } from "../../../control-api/src/routers/index";
import { getConfig } from "../config";

// in memory state for access token and refresh status
const state = {
  accessToken: null as string | null,
  isRefreshing: false,
  refreshPromise: null as Promise<boolean> | null,
};

// Use proxy path in development if configured
const getApiUrl = () => {
  const config = getConfig();
  if (config.appEnv === "development" && config.useProxy) {
    // Use local proxy path
    return `${window.location.origin}/api`;
  }
  return config.apiUrl;
};

const baseClient = hc<ApiType>(getApiUrl(), {
  init: {
    credentials: "include",
  },
});

const performTokenRefresh = async (): Promise<boolean> => {
  try {
    console.log("Performing token refresh via baseClient...");
    const response = await baseClient.auth["refresh-token"].$post();

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Refresh request failed: ${response.status} ${errorText}`,
      );
    }

    const data = await response.json();
    if (data.accessToken) {
      console.log("New access token received.");
      state.accessToken = data.accessToken;
      return true;
    }
    console.error("Refresh response did not contain accessToken.");
    return false;
  } catch (error) {
    console.error("Error during token refresh:", error);
    state.accessToken = null;
    return false;
  }
};

const authenticatedFetch: typeof fetch = async (input, init) => {
  const createRequestWithAuth = (
    reqInput: RequestInfo | URL,
    reqInit?: RequestInit,
  ): Request => {
    const headers = new Headers(reqInit?.headers);
    if (state.accessToken) {
      headers.set("Authorization", `Bearer ${state.accessToken}`);
    }
    const finalInput =
      reqInput instanceof Request ? reqInput : new Request(reqInput);
    return new Request(finalInput, { ...reqInit, headers });
  };

  let request = createRequestWithAuth(input, init);
  let response = await fetch(request).catch((e) => {
    console.error("Fetch error:", e.message);
    throw e;
  });

  if (response.status === 401) {
    // Get the original request URL to retry after refreshing the token
    const requestUrl = request.url;

    if (!state.isRefreshing) {
      console.log("Refreshing tokens...");
      state.isRefreshing = true;
      state.refreshPromise = performTokenRefresh()
        .catch((err: unknown) => {
          console.error("performTokenRefresh failed:", err);
          return false;
        })
        .finally(() => {
          console.log("Resetting refresh status.");
          state.isRefreshing = false;
          state.refreshPromise = null;
        });
    }

    const refreshSuccessful = await state.refreshPromise;

    if (refreshSuccessful) {
      console.log("Token refresh successful, retrying original request");
      request = createRequestWithAuth(input, init); // Recreate request with new token
      response = await fetch(request); // Retry with global fetch
    } else {
      console.error(
        "Token refresh failed or was unsuccessful. Returning original 401 for:",
        requestUrl,
      );
      return response; // Return the original 401 response
    }
  }

  return response; // Return the response from the fetch
};

// Main client with auth : uses the fetch interceptor for automatic token refresh
export const client = hc<ApiType>(getApiUrl(), {
  fetch: authenticatedFetch,
});
