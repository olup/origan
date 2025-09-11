import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "./logger.js";
import type { BuildResult } from "./types.js";

type ExecWithLogs = (command: string, logger: Logger) => Promise<string>;

export async function executeBuild(
  execWithLogs: ExecWithLogs,
  logger: Logger,
): Promise<BuildResult> {
  // ni will automatically detect the package manager
  await logger.info("Installing dependencies...");

  // ni automatically detects and uses the right package manager
  // It will use npm, yarn, pnpm, or bun based on lock files
  await execWithLogs("ni", logger);

  // nr runs scripts using the detected package manager
  await logger.info("Running build script...");
  await execWithLogs("nr build", logger);

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
