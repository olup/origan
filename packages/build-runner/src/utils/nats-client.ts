import { jetstream } from "@nats-io/jetstream";
import type { NatsConnection } from "@nats-io/nats-core";
import * as nkeys from "@nats-io/nkeys";
import * as nats from "@nats-io/transport-node";

export const subjects = {
  builds: {
    status: (buildId = "*") => `builds.${buildId}.status`,
    logs: (buildId = "*") => `builds.${buildId}.logs`,
  },
};

export async function getNatsClient(server: string, nkeyCreds?: string) {
  let creds = {};
  if (nkeyCreds) {
    const args = nkeyCreds.split("\n");
    creds = {
      nkey: args[1],
      sigCB: (nonce: Uint8Array) => {
        const sk = nkeys.fromSeed(Buffer.from(args[0]));
        return sk.sign(nonce);
      },
    };
  }

  return nats.connect({ servers: [server], ...creds });
}

export type BuildStatus = "queued" | "in_progress" | "completed" | "failed";

export interface BuildEvent {
  buildId: string;
  status: BuildStatus;
  timestamp: string;
  error?: string;
  exitCode?: number;
  message?: string;
}

export interface BuildLogEntry {
  timestamp: string;
  level: "info" | "error" | "warn" | "debug";
  message: string;
}

export async function createBuildEventsClient(nc: NatsConnection) {
  const js = jetstream(nc);

  const publishBuildStatus = async (event: BuildEvent): Promise<boolean> => {
    const subject = subjects.builds.status(event.buildId);
    try {
      await js.publish(subject, JSON.stringify(event));
      console.log(`Published build status to ${subject}:`, event.status);
      return true;
    } catch (error) {
      console.error(`Error publishing build status to ${subject}:`, error);
      throw error; // Re-throw to let caller handle the error
    }
  };

  const publishBuildLog = async (
    buildId: string,
    log: BuildLogEntry
  ): Promise<boolean> => {
    const subject = subjects.builds.logs(buildId);
    try {
      await js.publish(subject, JSON.stringify(log));
      return true;
    } catch (error) {
      console.error(`Error publishing build log to ${subject}:`, error);
      throw error; // Re-throw to let caller handle the error
    }
  };

  const close = async (): Promise<void> => {
    await nc.close();
  };

  return {
    publishBuildStatus,
    publishBuildLog,
    close,
  };
}

export type NatsClient = Awaited<ReturnType<typeof createBuildEventsClient>>;
