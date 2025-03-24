import { treaty } from "@elysiajs/eden";
import type { Server } from "../../api/src/index";

const serverClient = treaty<Server>(window.location.origin);

export default serverClient;
