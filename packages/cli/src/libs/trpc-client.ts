import type { AppRouter } from "@origan/control-api/src/trpc/router";
import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  splitLink,
} from "@trpc/client";
import superjson from "superjson";
import { config } from "../config.js";
import { getAccessToken } from "../services/auth.service.js";

// Helper to check if input needs special handling (FormData)
function isFormData(op: { input?: unknown }) {
  return op.input instanceof FormData;
}

import type { CreateTRPCClient } from "@trpc/client";

// Create tRPC client with authentication
export const trpc: CreateTRPCClient<AppRouter> = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: isFormData,
      // Use regular httpLink for FormData (no batching)
      true: httpLink({
        url: `${config.apiUrl}/trpc`,
        transformer: superjson,
        fetch: async (url, options) => {
          const token = await getAccessToken();
          const headers = {
            ...options?.headers,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          };
          return fetch(url, { ...options, headers });
        },
      }),
      // Use batch link for regular JSON requests
      false: httpBatchLink({
        url: `${config.apiUrl}/trpc`,
        transformer: superjson,
        fetch: async (url, options) => {
          const token = await getAccessToken();
          const headers = {
            ...options?.headers,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          };
          return fetch(url, { ...options, headers });
        },
      }),
    }),
  ],
});
