import type { Logger } from "./logger.js";
import type { PackageManager } from "./package-manager.js";

type ExecWithLogs = (command: string, logger: Logger) => Promise<string>;

export async function executeBuild(
  packageManager: PackageManager,
  execWithLogs: ExecWithLogs,
  logger: Logger,
): Promise<void> {
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
}
