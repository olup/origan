import { hc } from "hono/client";
import type { ApiType } from "../../../control-api/src/routers/index.js";
import { config } from "../config.js";

export const client = hc<ApiType>(config.apiUrl);
