import type { AppRouter } from "@origan/control-api/src/trpc/router";
import { createTRPCClient, httpLink, type TRPCClient } from "@trpc/client";
import superjson from "superjson";

export function createControlApiClient(
  apiUrl: string,
  token?: string,
): TRPCClient<AppRouter> {
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: `${apiUrl}/trpc`,
        transformer: superjson,
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : undefined,
        fetch(url, options) {
          // Allow FormData to pass through without JSON transformation
          const body = options?.body;
          if (body instanceof FormData) {
            return fetch(url, {
              ...options,
              body,
            });
          }
          return fetch(url, options);
        },
      }),
    ],
  });
}
