import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanDirectory, collectFiles, validateDirectory } from "./file.js";

describe("cli file utils", () => {
  it("collects files recursively", () => {
    const dir = mkdtempSync(join(tmpdir(), "origan-files-"));
    const nested = join(dir, "nested");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(dir, "a.txt"), "a");
    writeFileSync(join(nested, "b.txt"), "b");

    const files = collectFiles(dir);

    expect(files.length).toBe(2);
    expect(files).toEqual(
      expect.arrayContaining([join(dir, "a.txt"), join(nested, "b.txt")]),
    );

    rmSync(dir, { recursive: true, force: true });
  });

  it("validates directory existence", () => {
    const dir = mkdtempSync(join(tmpdir(), "origan-validate-"));
    const filePath = join(dir, "file.txt");
    writeFileSync(filePath, "x");

    expect(validateDirectory(dir)).toBe(true);
    expect(validateDirectory(filePath)).toBe(false);
    expect(validateDirectory(join(dir, "missing"))).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });

  it("cleans directories", () => {
    const dir = mkdtempSync(join(tmpdir(), "origan-clean-"));
    writeFileSync(join(dir, "file.txt"), "x");

    cleanDirectory(dir);
    expect(validateDirectory(dir)).toBe(false);
  });
});
