import { hc } from "hono/client";
import type { ApiType } from "../../../control-api/src/routers/index.js";

export function createControlApiClient(apiUrl: string) {
  return hc<ApiType>(apiUrl);
}
