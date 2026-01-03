import { describe, expect, it } from "vitest";
import { generateDeploymentSubdomain, generateSubdomain } from "./subdomain.js";

describe("subdomain utils", () => {
  it("generates dns-safe subdomains", () => {
    const subdomain = generateSubdomain(10);
    expect(subdomain).toHaveLength(10);
    expect(subdomain).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]+$/);
  });

  it("generates deployment subdomains with project suffix", () => {
    const subdomain = generateDeploymentSubdomain("myproject");
    expect(subdomain).toMatch(/--myproject$/);
    const [prefix] = subdomain.split("--");
    expect(prefix).toHaveLength(8);
  });
});
