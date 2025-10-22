import type { AppRouter } from "@origan/control-api/src/trpc/router";
import { QueryClient } from "@tanstack/react-query";
import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  httpSubscriptionLink,
  splitLink,
  TRPCClientError,
} from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
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
        // Don't retry on 404
        if (error instanceof TRPCClientError) {
          const status = error.data?.httpStatus;
          if (status === 404) {
            return false;
          }
          // Allow one retry for 401 (token refresh scenario)
          if (status === 401 && failureCount >= 1) {
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

// Helper to get CSRF token from cookie
function getCsrfToken(): string | null {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : null;
}

// Create custom fetch with authentication and CSRF protection
const authenticatedFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers);

  if (state.accessToken) {
    headers.set("Authorization", `Bearer ${state.accessToken}`);
  }

  // Add CSRF token for state-changing operations
  const method = init?.method?.toUpperCase() || "GET";
  if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers.set("X-CSRF-Token", csrfToken);
    }
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

// Create tRPC client with split link for FormData and subscription support
export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === "subscription",
      // Use SSE link for subscriptions
      true: httpSubscriptionLink({
        url: `${getApiUrl()}/trpc`,
        transformer: superjson,
        eventSourceOptions: () => ({
          headers: {
            authorization: state.accessToken
              ? `Bearer ${state.accessToken}`
              : undefined,
          },
          withCredentials: true,
        }),
      }),
      // Use split link for queries/mutations
      false: splitLink({
        condition: (op) => isNonJsonSerializable(op.input),
        // Use regular httpLink for FormData (no batching)
        true: httpLink({
          url: `${getApiUrl()}/trpc`,
          fetch: authenticatedFetch,
          transformer: superjson,
        }),
        // Use batch link for regular JSON requests
        false: httpBatchLink({
          url: `${getApiUrl()}/trpc`,
          fetch: authenticatedFetch,
          transformer: superjson,
        }),
      }),
    }),
  ],
});

// Create tRPC proxy with TanStack React Query integration
export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
