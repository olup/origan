import { getConfig } from "./config.js";
import { type Logger, createBuildLogger } from "./utils/logger.js";
import {
  type BuildStatus,
  type NatsClient,
  createBuildEventsClient,
  getNatsClient,
} from "./utils/nats-client.js";
import { detectPackageManager } from "./utils/package-manager.js";
import { executeBuild } from "./utils/build.js";
import { execWithLogs } from "./utils/exec.js";

const config = getConfig();

console.log("Build Runner Configuration:", config);

async function updateBuildStatus(
  client: NatsClient,
  logger: Logger,
  status: BuildStatus,
  message?: string,
  error?: string,
  exitCode?: number
) {
  try {
    const buildEvent = {
      buildId: config.BUILD_ID,
      status,
      timestamp: new Date().toISOString(),
      message,
      error,
      exitCode,
    };

    await client.publishBuildStatus(buildEvent);
    await logger.info(`Build status changed to ${status}: ${message || ""}`);
  } catch (error) {
    console.error(
      `Failed to message update build status ${status} for build ${config.BUILD_ID}:`,
      error
    );
    process.exit(1);
  }
}

async function runBuild() {
  const nc = await getNatsClient(
    config.EVENTS_NATS_SERVER,
    config.EVENTS_NATS_NKEY_CREDS
  );
  console.log(`Connected to NATS server ${config.EVENTS_NATS_SERVER}`);

  const eventsClient = await createBuildEventsClient(nc);
  const logger = await createBuildLogger(eventsClient, config.BUILD_ID);

  try {
    await updateBuildStatus(
      eventsClient,
      logger,
      "in_progress",
      "Build started"
    );

    await logger.info(
      `Starting build for repository: ${config.REPO_FULL_NAME}`
    );

    await logger.info(`Branch: ${config.BRANCH}, Commit: ${config.COMMIT_SHA}`);

    await logger.info("Cloning repository...");
    await execWithLogs(
      `git clone --depth 1 --branch ${config.BRANCH} https://x-access-token:${config.GITHUB_TOKEN}@github.com/${config.REPO_FULL_NAME}.git /app`,
      logger
    );
    process.chdir("/app");
    await execWithLogs(
      `git fetch origin ${config.COMMIT_SHA} --depth 1`,
      logger
    );
    await execWithLogs("git config advice.detachedHead false", logger);
    await execWithLogs(`git checkout ${config.COMMIT_SHA}`, logger);

    // Detect package manager and run build
    const packageManager = await detectPackageManager(execWithLogs, logger);
    await executeBuild(packageManager, execWithLogs, logger);

    await updateBuildStatus(
      eventsClient,
      logger,
      "completed",
      "Build completed successfully",
      undefined,
      0
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logger.error(`Build failed: ${errorMessage}`);
    await updateBuildStatus(
      eventsClient,
      logger,
      "failed",
      "Build failed",
      errorMessage,
      1
    );
  } finally {
    if (eventsClient) {
      await eventsClient.close();
    }
  }
}

let buildSuccessful = false;

runBuild()
  .then(() => {
    buildSuccessful = true;
  })
  .catch((err) => {
    console.error("Unhandled error in build process:", err);
    buildSuccessful = false;
  })
  .finally(() => {
    process.exit(buildSuccessful ? 0 : 1);
  });
