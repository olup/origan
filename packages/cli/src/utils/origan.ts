import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "comment-json";
import { type OriganConfig, origanConfigSchema } from "../types.js";

export class OriganConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OriganConfigError";
  }
}

export class OriganConfigNotFoundError extends OriganConfigError {
  constructor(path: string) {
    super(`Origan config not found in ${path}`);
  }
}

export class OriganConfigInvalidError extends OriganConfigError {}

export async function parseOriganConfig(): Promise<OriganConfig> {
  // Check for origan.jsonc file
  const origanConfigPath = join(process.cwd(), "origan.jsonc");

  try {
    await stat(origanConfigPath);
  } catch (_error) {
    throw new OriganConfigNotFoundError(origanConfigPath);
  }

  // Read and parse config
  const origanContent = await readFile(origanConfigPath, "utf-8");
  const parsedConfig = parse(origanContent) as unknown;

  const result = origanConfigSchema.safeParse(parsedConfig);
  if (!result.success) {
    throw new OriganConfigInvalidError(result.error.message);
  }

  return result.data;
}
