import { describe, expect, it } from "vitest";
import {
  generateSecureToken,
  hashTokenForLookup,
  hashTokenWithSalt,
  verifyTokenWithSalt,
} from "./crypto.js";

describe("crypto utils", () => {
  it("generates tokens of expected length", () => {
    const token = generateSecureToken();
    expect(token).toHaveLength(64);
  });

  it("verifies salted token hashes", () => {
    const token = "secret";
    const hashed = hashTokenWithSalt(token);

    expect(verifyTokenWithSalt(token, hashed)).toBe(true);
    expect(verifyTokenWithSalt("wrong", hashed)).toBe(false);
  });

  it("hashes tokens deterministically for lookup", () => {
    const hashA = hashTokenForLookup("token");
    const hashB = hashTokenForLookup("token");
    const hashC = hashTokenForLookup("other");

    expect(hashA).toBe(hashB);
    expect(hashA).not.toBe(hashC);
  });
});
