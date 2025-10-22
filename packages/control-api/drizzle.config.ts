import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined");
}
export default defineConfig({
  out: "./drizzle",
  schema: "./src/libs/db/schema.ts", // Use compiled JS instead of TS
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
