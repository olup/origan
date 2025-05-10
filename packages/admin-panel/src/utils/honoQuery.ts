import type { QueryClient, QueryFunction } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";

export const safeQuery = async <T extends Response>(fetchQuery: Promise<T>) => {
  const response = await fetchQuery;
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  return response.json();
};

// Define a type to infer the response body from a Hono handler
// biome-ignore lint/suspicious/noExplicitAny: any types are actually inferred
type InferResponseType<T extends (args: any) => Promise<any>> = T extends (
  // biome-ignore lint/suspicious/noExplicitAny: any types are actually inferred
  args: any,
) => Promise<infer R>
  ? R
  : // biome-ignore lint/suspicious/noExplicitAny: any types are actually inferred
    any;

// biome-ignore lint/suspicious/noExplicitAny: any types are actually inferred
export function createQueryHelper<THandler extends (args: any) => Promise<any>>(
  handler: THandler,
  inputArgs?: InferRequestType<THandler>,
  key?: string,
): {
  queryKey: readonly [string, InferRequestType<THandler>["query"]];
  queryFn: QueryFunction<
    Awaited<ReturnType<InferResponseType<THandler>["json"]>>
  >;
  prefetch: (client: QueryClient) => Promise<void>;
  invalidate: (
    client: QueryClient,
    options?: { exact?: boolean },
  ) => Promise<void>;
} {
  const queryKey = [key ?? handler.name ?? "anonymous", inputArgs] as const;

  const queryFn = () => handler({ ...inputArgs }).then((r) => r.json());

  return {
    queryKey,
    queryFn,
    prefetch: (client) => client.prefetchQuery({ queryKey, queryFn }),
    invalidate: (client, options) =>
      client.invalidateQueries({ queryKey, exact: options?.exact ?? true }),
  };
}

export function createMutationHelper<
  // biome-ignore lint/suspicious/noExplicitAny: any types are actually inferred
  THandler extends (args: any) => Promise<any>,
>(
  handler: THandler,
  key?: string,
): {
  mutationKey: [string];
  mutationFn: (
    inputArgs: InferRequestType<THandler>,
  ) => ReturnType<InferResponseType<THandler>["json"]>;
} {
  return {
    mutationKey: [key ?? handler.name ?? "anonymous"],
    mutationFn: (input) =>
      handler(input).then((r) => r.json()) as ReturnType<
        InferResponseType<THandler>["json"]
      >,
  };
}
