import { describe, expect, it, vi } from "vitest";

function setGatewayEnv() {
  process.env.ORIGAN_DEPLOY_DOMAIN = "example.com";
  process.env.RUNNER_URL = "http://runner";
  process.env.BUCKET_URL = "http://bucket";
  process.env.BUCKET_ACCESS_KEY = "test";
  process.env.BUCKET_SECRET_KEY = "test";
  process.env.TLS_CERT_FILE = "/tmp/cert.pem";
  process.env.TLS_KEY_FILE = "/tmp/key.pem";
}

async function loadApiModule() {
  setGatewayEnv();
  vi.resetModules();
  return await import("./api.js");
}

describe("gateway api route matching", () => {
  it("normalizes paths with leading slash", async () => {
    const { normalizePath } = await loadApiModule();
    expect(normalizePath("api/test")).toBe("/api/test");
    expect(normalizePath("/api/test")).toBe("/api/test");
  });

  it("matches exact routes", async () => {
    const { matchRoute } = await loadApiModule();
    expect(matchRoute("/api/users", "/api/users")).toBe(true);
    expect(matchRoute("/api/users/1", "/api/users")).toBe(false);
  });

  it("matches param routes", async () => {
    const { matchRoute } = await loadApiModule();
    expect(matchRoute("/api/users/123", "/api/users/:id")).toBe(true);
    expect(matchRoute("/api/users/123/profile", "/api/users/:id")).toBe(false);
  });

  it("matches wildcard routes", async () => {
    const { matchRoute } = await loadApiModule();
    expect(matchRoute("/api/anything", "/api/*")).toBe(true);
    expect(matchRoute("/api/users/123/profile", "/api/*")).toBe(true);
  });

  it("scores static routes above param and wildcard", async () => {
    const { scoreRoute } = await loadApiModule();
    const staticScore = scoreRoute("/api/users");
    const paramScore = scoreRoute("/api/users/:id");
    const wildcardScore = scoreRoute("/api/*");

    expect(staticScore).toBeGreaterThan(paramScore);
    expect(paramScore).toBeGreaterThan(wildcardScore);
  });
});
