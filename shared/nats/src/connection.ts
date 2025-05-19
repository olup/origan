import { DiscardPolicy, StorageType } from "@nats-io/jetstream";
import { jetstreamManager } from "@nats-io/jetstream";
import type { JetStreamClient } from "@nats-io/jetstream";
import type { NatsConnection } from "@nats-io/nats-core";
import { connect as natsConnect } from "@nats-io/transport-node";
import { STREAM_NAMES, subjects } from "./subjects";
import type { NatsConfig } from "./types";

const MAX_AGE_24H = 1000 * 1000 * 60 * 60 * 24;

let natsClient: NatsConnection | null = null;
let jsClient: JetStreamClient | null = null;

async function setupStreams(nc: NatsConnection) {
  const jsm = await await jetstreamManager(nc);

  await jsm.streams
    .add({
      name: STREAM_NAMES.BUILD_EVENTS,
      subjects: [subjects.builds.status(), subjects.builds.logs()],
      storage: StorageType.Memory,
      max_age: MAX_AGE_24H,
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
      storage: StorageType.Memory,
      max_age: MAX_AGE_24H,
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

export async function connect(
  config: NatsConfig,
): Promise<{ nc: NatsConnection; js: JetStreamClient }> {
  if (natsClient && jsClient) {
    return { nc: natsClient, js: jsClient };
  }

  natsClient = await natsConnect({
    servers: [config.server],
    user: config.nkeyCreds ? config.nkeyCreds.split("\n")[1] : undefined,
    nkey: config.nkeyCreds ? config.nkeyCreds.split("\n")[0] : undefined,
  });

  if (!natsClient) {
    throw new Error("Failed to connect to NATS server");
  }

  const jetstreamClient = await setupStreams(natsClient);

  return { nc: natsClient, js: jetstreamClient };
}

export async function disconnect(): Promise<void> {
  if (natsClient) {
    await natsClient.close();
    natsClient = null;
    jsClient = null;
  }
}
