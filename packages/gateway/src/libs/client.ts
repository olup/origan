import type { ApiType } from "@origan/control-api/routers";
import { hc } from "hono/client";

if (!process.env.CONTROL_API_URL) {
  throw new Error("CONTROL_API_URL is not defined");
}
export const client = hc<ApiType>(process.env.CONTROL_API_URL);
