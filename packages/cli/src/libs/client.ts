import { hc } from "hono/client";
import type { ApiType } from "../../../control-api/src/routers/index.js";
import { API_URL } from "../constants.js";
export const client = hc<ApiType>(API_URL);
