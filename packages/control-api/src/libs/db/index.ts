import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../../config.js";
import * as schema from "./schema.js";

export const db = drizzle({ connection: env.DATABASE_URL, schema });
