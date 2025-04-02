import { defineConfig } from "drizzle-kit";
import { db_url } from "./src/config";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: db_url,
  },
});
