import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = process.env.XDG_CONFIG_HOME;

async function loadTokenModule(tempDir: string) {
  process.env.XDG_CONFIG_HOME = tempDir;
  vi.resetModules();
  return await import("./token.js");
}

afterEach(() => {
  process.env.XDG_CONFIG_HOME = originalEnv;
});

describe("cli token storage", () => {
  it("saves, reads, and clears tokens", async () => {
    const dir = mkdtempSync(join(tmpdir(), "origan-auth-"));
    const { saveTokens, readTokens, clearTokens } = await loadTokenModule(dir);

    await saveTokens({ accessToken: "a", refreshToken: "b" });
    const read = await readTokens();
    expect(read).toEqual({ accessToken: "a", refreshToken: "b" });

    await clearTokens();
    const cleared = await readTokens();
    expect(cleared).toBeNull();

    rmSync(dir, { recursive: true, force: true });
  });
});
