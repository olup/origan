import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRouteFromFile, normalizeApiPath } from "./path.js";

describe("cli path utils", () => {
  it("normalizes api paths", () => {
    expect(normalizeApiPath("users/index.ts")).toBe("/api/users");
    expect(normalizeApiPath("users/[id].ts")).toBe("/api/users/:id");
    expect(normalizeApiPath("[...all].ts")).toBe("/api/*");
  });

  it("creates route config from file", () => {
    const apiDir = "/tmp/api";
    const filePath = join(apiDir, "users", "index.ts");
    const route = createRouteFromFile(apiDir, filePath);

    expect(route.urlPath).toBe("/api/users");
    expect(route.bundlePath).toBe("users/index.js");
  });
});
