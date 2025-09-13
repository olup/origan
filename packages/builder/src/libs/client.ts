import type { AppRouter } from "@origan/control-api/src/trpc/router";
import {
  type CreateTRPCClient,
  createTRPCClient,
  httpLink,
} from "@trpc/client";
import superjson from "superjson";

export function createControlApiClient(
  apiUrl: string,
  token?: string,
): CreateTRPCClient<AppRouter> {
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
      }),
    ],
  });
}
