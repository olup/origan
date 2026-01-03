import { describe, expect, it } from "vitest";
import { generateReference, REFERENCE_PREFIXES } from "./reference.js";

describe("reference utils", () => {
  it("generates references with correct length", () => {
    const ref = generateReference(8);
    expect(ref).toHaveLength(8);
    expect(ref).toMatch(/^[a-z]+$/);
  });

  it("adds prefixes when provided", () => {
    const ref = generateReference(6, REFERENCE_PREFIXES.BUILD);
    expect(ref.startsWith(REFERENCE_PREFIXES.BUILD)).toBe(true);
    expect(ref).toHaveLength(REFERENCE_PREFIXES.BUILD.length + 6);
  });
});
