import { type BuildEvent, type BuildStatus, NatsClient } from "@origan/nats";
import { getConfig } from "./config.js";
import { executeBuild } from "./utils/build.js";
import { createDeployment } from "./utils/deploy.js";
import { execWithLogs } from "./utils/exec.js";
import { createBuildLogger } from "./utils/logger.js";
import type { Logger } from "./utils/logger.js";
import { detectPackageManager } from "./utils/package-manager.js";

const config = getConfig();

async function updateBuildStatus(
  client: NatsClient,
  logger: Logger,
  status: BuildStatus,
  message?: string,
  error?: string,
  exitCode?: number,
) {
  const buildEvent: BuildEvent = {
    buildId: config.BUILD_ID,
    status,
    timestamp: new Date().toISOString(),
    message,
    error,
    exitCode,
  };

  await client.publisher.publishBuildStatus(buildEvent);
  await logger.info(`Build status changed to ${status}: ${message || ""}`);
}

async function runBuild() {
  const nc = new NatsClient({
    server: config.EVENTS_NATS_SERVER,
    nkeyCreds: config.EVENTS_NATS_NKEY_CREDS,
  });
  await nc.connect();

  console.log(`Connected to NATS server ${config.EVENTS_NATS_SERVER}`);

  const logger = await createBuildLogger(nc, config.BUILD_ID);

  try {
    await updateBuildStatus(nc, logger, "in_progress", "Build started");

    await logger.info(
      `Starting build for repository: ${config.REPO_FULL_NAME}`,
    );
    await logger.info(`Branch: ${config.BRANCH}, Commit: ${config.COMMIT_SHA}`);

    // Clone repository
    await logger.info("Cloning repository...");
    await execWithLogs(
      `git clone --depth 1 --branch ${config.BRANCH} https://x-access-token:${config.GITHUB_TOKEN}@github.com/${config.REPO_FULL_NAME}.git /app`,
      logger,
    );
    process.chdir("/app");
    await execWithLogs(
      `git fetch origin ${config.COMMIT_SHA} --depth 1`,
      logger,
    );
    await execWithLogs("git config advice.detachedHead false", logger);
    await execWithLogs(`git checkout ${config.COMMIT_SHA}`, logger);

    // Build
    await logger.info("Starting build...");
    const buildResult = await executeBuild(
      await detectPackageManager(execWithLogs, logger),
      execWithLogs,
      logger,
    );

    // Deploy
    await updateBuildStatus(
      nc,
      logger,
      "in_progress",
      "Creating deployment...",
    );
    await createDeployment(config.BUILD_ID, buildResult.buildDir, logger);

    await updateBuildStatus(
      nc,
      logger,
      "completed",
      "Build and deployment completed successfully",
      undefined,
      0,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logger.error(`Build failed: ${errorMessage}`);
    await updateBuildStatus(
      nc,
      logger,
      "failed",
      "Build failed",
      errorMessage,
      1,
    );
    throw error;
  } finally {
    await nc.disconnect();
  }
}

runBuild().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
