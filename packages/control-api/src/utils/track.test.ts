import { describe, expect, it } from "vitest";
import { sanitizeTrackName } from "./track.js";

describe("track utils", () => {
  it("sanitizes track names", () => {
    expect(sanitizeTrackName("My Track!!")).toBe("my-track");
    expect(sanitizeTrackName("  ---  ")).toBe("default");
    expect(sanitizeTrackName("feature/ABC_123")).toBe("feature-abc-123");
  });
});
