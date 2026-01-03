import { describe, expect, it, vi } from "vitest";
import type { Config } from "../types/config.js";

function setGatewayEnv() {
  process.env.ORIGAN_DEPLOY_DOMAIN = "example.com";
  process.env.RUNNER_URL = "http://runner";
  process.env.BUCKET_URL = "http://bucket";
  process.env.BUCKET_ACCESS_KEY = "test";
  process.env.BUCKET_SECRET_KEY = "test";
  process.env.TLS_CERT_FILE = "/tmp/cert.pem";
  process.env.TLS_KEY_FILE = "/tmp/key.pem";
}

async function loadStaticModule() {
  setGatewayEnv();
  vi.resetModules();
  return await import("./static.js");
}

describe("gateway static resource helpers", () => {
  const config: Config = {
    version: 1,
    resources: [
      {
        kind: "static",
        urlPath: "/index.html",
        resourcePath: "app/index.html",
      },
      {
        kind: "dynamic",
        urlPath: "/api/*",
        resourcePath: "api/handler.js",
      },
    ],
  };

  it("normalizes url paths", async () => {
    const { normalizePath } = await loadStaticModule();
    expect(normalizePath("index.html")).toBe("/index.html");
  });

  it("finds matching static resources", async () => {
    const { findStaticResource } = await loadStaticModule();
    const resource = findStaticResource(config, "/index.html");
    expect(resource?.resourcePath).toBe("app/index.html");
    expect(findStaticResource(config, "/missing")).toBeNull();
  });

  it("builds headers with defaults and overrides", async () => {
    const { buildStaticHeaders } = await loadStaticModule();
    const headers = buildStaticHeaders({
      contentType: "text/html",
      resourceHeaders: { "Cache-Control": "public, max-age=0" },
      etag: "abc",
      lastModified: new Date("2024-01-01T00:00:00Z"),
      contentLength: 42,
      shouldGzip: false,
    });

    expect(headers["Content-Type"]).toBe("text/html");
    expect(headers["Cache-Control"]).toBe("public, max-age=0");
    expect(headers.ETag).toBe("abc");
    expect(headers["Content-Length"]).toBe("42");
  });

  it("sets gzip encoding without content length", async () => {
    const { buildStaticHeaders } = await loadStaticModule();
    const headers = buildStaticHeaders({
      contentType: "application/javascript",
      shouldGzip: true,
    });

    expect(headers["Content-Encoding"]).toBe("gzip");
    expect(headers["Content-Length"]).toBeUndefined();
  });
});
