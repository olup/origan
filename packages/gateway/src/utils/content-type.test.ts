import { describe, expect, it } from "vitest";
import { getContentType } from "./content-type.js";

describe("gateway content type", () => {
  it("returns known types", () => {
    expect(getContentType("index.html")).toBe("text/html");
    expect(getContentType("style.css")).toBe("text/css");
    expect(getContentType("app.js")).toBe("application/javascript");
  });

  it("falls back to octet-stream", () => {
    expect(getContentType("file.unknown")).toBe("application/octet-stream");
  });
});
