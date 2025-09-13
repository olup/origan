import type { AppRouter } from "@origan/control-api/src/trpc/router";
import { QueryClient } from "@tanstack/react-query";
import {
  httpBatchLink,
  httpLink,
  splitLink,
  TRPCClientError,
} from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";
import { getConfig } from "../config";

// State for managing access token
const state = {
  accessToken: null as string | null,
  isRefreshing: false,
  refreshPromise: null as Promise<boolean> | null,
};

// Get API URL based on environment
const getApiUrl = () => {
  const config = getConfig();
  if (config.appEnv === "development" && config.useProxy) {
    // Use local proxy path
    return `${window.location.origin}/api`;
  }
  return config.apiUrl;
};

// Create query client with default options
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry on 401 or 404
        if (error instanceof TRPCClientError) {
          const status = error.data?.httpStatus;
          if (status === 401 || status === 404) {
            return false;
          }
        }
        return failureCount < 3;
      },
    },
  },
});

// Helper to check if value is FormData or File
function isNonJsonSerializable(value: unknown): boolean {
  return (
    value instanceof FormData || value instanceof File || value instanceof Blob
  );
}

// Create custom fetch with authentication
const authenticatedFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers);

  if (state.accessToken) {
    headers.set("Authorization", `Bearer ${state.accessToken}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });

  // Handle 401 - attempt token refresh
  if (response.status === 401) {
    if (!state.isRefreshing) {
      state.isRefreshing = true;
      state.refreshPromise = performTokenRefresh()
        .catch((err: unknown) => {
          console.error("Token refresh failed:", err);
          return false;
        })
        .finally(() => {
          state.isRefreshing = false;
          state.refreshPromise = null;
        });
    }

    const refreshSuccessful = await state.refreshPromise;

    if (refreshSuccessful) {
      // Retry with new token
      const retryHeaders = new Headers(init?.headers);
      if (state.accessToken) {
        retryHeaders.set("Authorization", `Bearer ${state.accessToken}`);
      }
      return fetch(input, {
        ...init,
        headers: retryHeaders,
        credentials: "include",
      });
    }
  }

  return response;
};

// Create tRPC React Query client
export const trpc = createTRPCReact<AppRouter>();

// Perform token refresh
async function performTokenRefresh(): Promise<boolean> {
  try {
    console.log("Refreshing access token...");

    // Use the tRPC client directly for refresh
    const result = await fetch(`${getApiUrl()}/trpc/auth.refreshToken`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({}),
    });

    if (result.ok) {
      const data = await result.json();
      if (data.result?.data?.accessToken) {
        state.accessToken = data.result.data.accessToken;
        console.log("Access token refreshed successfully");
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error("Failed to refresh token:", error);
    state.accessToken = null;
    return false;
  }
}

// Create tRPC client with split link for FormData support
export const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition: (op) => isNonJsonSerializable(op.input),
      // Use regular httpLink for FormData (no batching)
      true: httpLink({
        url: `${getApiUrl()}/trpc`,
        fetch: authenticatedFetch,
      }),
      // Use batch link for regular JSON requests
      false: httpBatchLink({
        url: `${getApiUrl()}/trpc`,
        fetch: authenticatedFetch,
        transformer: superjson,
      }),
    }),
  ],
});
