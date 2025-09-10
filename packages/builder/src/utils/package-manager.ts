import type { Logger } from "./logger.js";

export type PackageManager = "npm" | "yarn" | "pnpm";

export async function detectPackageManager(
  execWithLogs: (command: string, logger: Logger) => Promise<string>,
  logger: Logger,
): Promise<PackageManager> {
  try {
    const packageJsonContent = await execWithLogs("cat package.json", logger);
    const packageJson = JSON.parse(packageJsonContent);

    if (packageJson.packageManager) {
      const packageManager = packageJson.packageManager.split(
        "@",
      )[0] as PackageManager;
      return packageManager;
    }

    const hasYarnLock =
      (await execWithLogs(
        "test -f yarn.lock && echo 'true' || echo 'false'",
        logger,
      )) === "true";
    const hasPnpmLock =
      (await execWithLogs(
        "test -f pnpm-lock.yaml && echo 'true' || echo 'false'",
        logger,
      )) === "true";
    const hasNpmLock =
      (await execWithLogs(
        "test -f package-lock.json && echo 'true' || echo 'false'",
        logger,
      )) === "true";

    if (hasYarnLock) {
      return "yarn";
    }
    if (hasPnpmLock) {
      return "pnpm";
    }
    if (hasNpmLock) {
      return "npm";
    }

    return "npm";
  } catch (error) {
    await logger.warn(
      `Failed to detect package manager, defaulting to npm: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return "npm";
  }
}
