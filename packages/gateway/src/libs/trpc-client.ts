import type { AppRouter } from "@origan/control-api/src/trpc/router";
import { createTRPCClient, httpLink, type TRPCClient } from "@trpc/client";
import superjson from "superjson";

if (!process.env.CONTROL_API_URL) {
  throw new Error("CONTROL_API_URL is not defined");
}

export const trpc: TRPCClient<AppRouter> = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: `${process.env.CONTROL_API_URL}/trpc`,
      transformer: superjson,
    }),
  ],
});
