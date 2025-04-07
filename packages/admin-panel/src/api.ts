import { hc } from "hono/client";
import type { ApiType } from "../../control-api/src/routers/index.js";

export default hc<ApiType>(import.meta.env.VITE_API_URL || "");
