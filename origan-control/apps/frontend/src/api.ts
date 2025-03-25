import type { ApiType } from "../../api/src/api";
import { hc } from "hono/client";

export default hc<ApiType>("");
