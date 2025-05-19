import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "./logger.js";
import type { PackageManager } from "./package-manager.js";
import type { BuildResult } from "./types.js";

type ExecWithLogs = (command: string, logger: Logger) => Promise<string>;

export async function executeBuild(
  packageManager: PackageManager,
  execWithLogs: ExecWithLogs,
  logger: Logger,
): Promise<BuildResult> {
  await logger.info(`Using package manager: ${packageManager}`);

  // Install dependencies
  await logger.info("Installing dependencies...");
  switch (packageManager) {
    case "yarn":
      await execWithLogs("yarn install", logger);
      await execWithLogs("yarn build", logger);
      break;
    case "pnpm":
      await execWithLogs("pnpm install", logger);
      await execWithLogs("pnpm run build", logger);
      break;
    default:
      await execWithLogs("npm install --force", logger);
      await execWithLogs("npm run build", logger);
  }

  // Find build output directory (usually 'dist' or 'build')
  const distDir = existsSync(join("/app", "dist"))
    ? join("/app", "dist")
    : join("/app", "build");

  if (!existsSync(distDir)) {
    throw new Error(
      "No build output directory found (tried 'dist' and 'build')",
    );
  }

  return {
    buildDir: distDir,
  };
}
