import { hc } from "hono/client";
import type { ApiType } from "../../../control-api/src/routers/index.js";

if (!process.env.CONTROL_API_URL) {
  throw new Error("CONTROL_API_URL is not defined");
}
export const client = hc<ApiType>(process.env.CONTROL_API_URL);
