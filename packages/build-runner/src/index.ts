import readline from "node:readline";
// packages/build-runner/src/index.ts
import { execaCommand } from "execa";
import { getConfig } from "./config.js";
import { type Logger, createBuildLogger } from "./utils/logger.js";
import {
  type BuildStatus,
  type NatsClient,
  createBuildEventsClient,
  getNatsClient,
} from "./utils/nats-client.js";

// Get validated config
const config = getConfig();

console.log("Build Runner Configuration:", config);

// Function to update build status
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

    // Also log the status change
    await logger.info(`Build status changed to ${status}: ${message || ""}`);
  } catch (error) {
    console.error(
      `Failed to message update build status ${status} for build ${config.BUILD_ID}:`,
      error
    );
    process.exit(1); // Exit with error as the status update is critical
  }
}

// Function to execute command and log output
async function execWithLogs(command: string, logger: Logger) {
  // Log the command being executed
  try {
    await logger.info(`Executing: ${command}`);

    // Use execaCommand which handles the full command string including arguments
    const subprocess = execaCommand(command, {
      // Enable stdio inheritance for proper stream handling
      stdio: ["ignore", "pipe", "pipe"],
    });

    const handleLine = (stream: "stdout" | "stderr", line: string) => {
      const logLevel = stream === "stdout" ? "info" : "error";
      logger[logLevel](line);
    };

    if (subprocess.stdout) {
      const rlStdout = readline.createInterface({ input: subprocess.stdout });
      rlStdout.on("line", (line) => handleLine("stdout", line));
    }

    if (subprocess.stderr) {
      const rlStderr = readline.createInterface({ input: subprocess.stderr });
      rlStderr.on("line", (line) => handleLine("stderr", line));
    }

    // Wait for process to complete and get the result
    const result = await subprocess;
    return result.stdout;
  } catch (error: unknown) {
    // Check if it's an ExecaError
    if (
      error &&
      typeof error === "object" &&
      "exitCode" in error &&
      "failed" in error
    ) {
      const execaError = error as {
        exitCode: number;
        failed: boolean;
        stderr?: string;
        stdout?: string;
      };
      if (execaError.failed) {
        await logger.error(
          `Command failed with exit code ${execaError.exitCode}`
        );
      }
    } else {
      await logger.error(
        `Command failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    throw error;
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
    // Update status to in_progress
    await updateBuildStatus(
      eventsClient,
      logger,
      "in_progress",
      "Build started"
    );

    // Execute the build using configuration
    await logger.info(
      `Starting build for repository: ${config.REPO_FULL_NAME}`
    );

    await logger.info(`Branch: ${config.BRANCH}, Commit: ${config.COMMIT_SHA}`);

    // Ensure /app directory exists and is writable
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
    await execWithLogs(`git checkout ${config.COMMIT_SHA}`, logger);

    // TODO this is where the build process would be executed

    // On successful completion
    await updateBuildStatus(
      eventsClient,
      logger,
      "completed",
      "Build completed successfully",
      undefined,
      0
    );
  } catch (error) {
    // On failure
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
    // Close NATS connection
    if (eventsClient) {
      await eventsClient.close();
    }
  }
}

// Start the build
// Track build success/failure
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
