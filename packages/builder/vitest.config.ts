import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    exclude: ["node_modules", "dist", "test/fixtures"],
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: ["node_modules", "dist", "test"],
    },
    testTimeout: 30000,
  },
});
