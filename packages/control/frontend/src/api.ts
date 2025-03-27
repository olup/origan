import { hc } from "hono/client";
import type { ApiType } from "../../api/src/index";

export default hc<ApiType>("");
