import readline from "node:readline";
import { execaCommand } from "execa";
import type { Logger } from "./logger.js";

type ExecOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export async function execWithLogs(
  command: string,
  logger: Logger,
  options: ExecOptions = {},
): Promise<string> {
  try {
    await logger.info(`Executing: ${command}`);

    const subprocess = execaCommand(command, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      cwd: options.cwd,
      env: options.env,
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

    const result = await subprocess;
    return result.stdout;
  } catch (error: unknown) {
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
          `Command failed with exit code ${execaError.exitCode}`,
        );
      }
    } else {
      await logger.error(
        `Command failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    throw error;
  }
}
