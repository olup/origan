import type { JetStreamClient } from "@nats-io/jetstream";
import {
  DiscardPolicy,
  jetstreamManager,
  StorageType,
} from "@nats-io/jetstream";
import {
  type ConnectionOptions,
  credsAuthenticator,
  type NatsConnection,
} from "@nats-io/nats-core";
import { connect as natsConnect } from "@nats-io/transport-node";
import { STREAM_NAMES, subjects } from "./subjects";
import type { NatsConfig } from "./types";

const MAX_AGE_1H = 1000 * 1000 * 60 * 60;

export async function setupStreams(
  nc: NatsConnection,
): Promise<JetStreamClient> {
  const jsm = await jetstreamManager(nc);

  await jsm.streams
    .add({
      name: STREAM_NAMES.BUILD_EVENTS,
      subjects: [subjects.builds.status(), subjects.builds.logs()],
      storage: StorageType.File,
      max_age: MAX_AGE_1H,
      discard: DiscardPolicy.Old,
    })
    .catch((error: Error) => {
      if (error.message.includes("already in use")) {
        console.log("Build events stream already exists");
      } else {
        throw error;
      }
    });

  await jsm.streams
    .add({
      name: STREAM_NAMES.DEPLOYMENT_EVENTS,
      subjects: ["logs.*.*", "events.*.*"],
      storage: StorageType.File,
      max_age: MAX_AGE_1H,
      discard: DiscardPolicy.Old,
    })
    .catch((error: Error) => {
      if (error.message.includes("already in use")) {
        console.log("Deployment events stream already exists");
      } else {
        throw error;
      }
    });

  return jsm.jetstream();
}

export async function createConnection(
  config: NatsConfig,
): Promise<{ nc: NatsConnection; js: JetStreamClient }> {
  const connectionOptions: ConnectionOptions = {
    servers: [config.server],
  };

  if (config.nkeyCreds) {
    connectionOptions.authenticator = credsAuthenticator(
      Buffer.from(config.nkeyCreds, "utf-8"),
    );
  }

  const nc = await natsConnect(connectionOptions);

  if (!nc) {
    throw new Error("Failed to connect to NATS server");
  }

  const js = await setupStreams(nc);

  return { nc, js };
}
