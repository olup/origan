import type { BuildLogEntry, NatsClient } from "./nats-client.js";

export type LogLevel = "info" | "error" | "warn" | "debug";

export function createBuildLogger(client: NatsClient, buildId: string) {
  const log = async (level: LogLevel, message: string): Promise<void> => {
    const timestamp = new Date().toISOString();
    const entry: BuildLogEntry = {
      timestamp,
      level,
      message,
    };

    // Always log to console
    const prefix = `[${level.toUpperCase()}][${buildId}]`;
    if (level === "error") {
      console.error(`${prefix} ${message}`);
    } else if (level === "warn") {
      console.warn(`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`);
    }

    // Publish to NATS
    try {
      await client.publishBuildLog(buildId, entry);
    } catch (error) {
      console.error(`Failed to publish log to NATS: ${error}`);
      // Continue execution even if NATS publishing fails
    }
  };

  return {
    info: (message: string) => log("info", message),
    error: (message: string) => log("error", message),
    warn: (message: string) => log("warn", message),
    debug: (message: string) => log("debug", message),
  };
}

export type Logger = ReturnType<typeof createBuildLogger>;
