import type { ApiType } from "@origan/control-api/routers";
import { hc } from "hono/client";

export function createControlApiClient(apiUrl: string) {
  return hc<ApiType>(apiUrl);
}
