import { describe, expect, it } from "vitest";
import { DeploymentManifestSchema } from "./manifest.js";

describe("deployment manifest schema", () => {
  it("accepts valid manifest", () => {
    const result = DeploymentManifestSchema.safeParse({
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
          methods: ["GET"],
          wildcard: true,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid resources", () => {
    const result = DeploymentManifestSchema.safeParse({
      version: 1,
      resources: [
        {
          kind: "static",
          urlPath: "/index.html",
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
