import {
  DiscardPolicy,
  jetstreamManager,
  StorageType,
} from "@nats-io/jetstream";
import type { NatsConnection } from "@nats-io/nats-core";
import * as nkeys from "@nats-io/nkeys";
import * as nats from "@nats-io/transport-node";
import { env } from "../config.js";
import { subjects } from "./nats-subjects.js";

export const STREAM_NAMES = {
  BUILD_EVENTS: "BUILD_EVENTS_STREAM",
  DEPLOYMENT_EVENTS: "DEPLOYMENT_EVENTS_STREAM",
} as const;

let natsClient: NatsConnection | null = null;

async function setupStreams(nc: NatsConnection) {
  const jsm = await jetstreamManager(nc);

  // Setup build events stream
  await jsm.streams
    .add({
      name: STREAM_NAMES.BUILD_EVENTS,
      subjects: [subjects.builds.status(), subjects.builds.logs()],
      storage: StorageType.Memory,
      max_age: 1000 * 1000 * 60 * 60 * 24, // 1 day, in nanoseconds
      discard: DiscardPolicy.Old,
    })
    .catch(async (error: Error) => {
      if (error.message.includes("already in use")) {
        console.log("Build events stream already exists");
      } else {
        throw error;
      }
    });

  // Setup deployment events stream
  await jsm.streams
    .add({
      name: STREAM_NAMES.DEPLOYMENT_EVENTS,
      subjects: ["logs.*.*", "events.*.*"],
      storage: StorageType.Memory,
      max_age: 1000 * 1000 * 60 * 60 * 24,
      discard: DiscardPolicy.Old,
    })
    .catch(async (error: Error) => {
      if (error.message.includes("already in use")) {
        console.log("Deployment events stream already exists");
      } else {
        throw error;
      }
    });
}

export async function getNatsClient(): Promise<NatsConnection> {
  if (natsClient) {
    console.log("Using existing NATS connection");
    await setupStreams(natsClient);
    console.log("NATS streams setup completed");
    return natsClient;
  }

  let creds = {};
  if (env.EVENTS_NATS_NKEY_CREDS) {
    const args = env.EVENTS_NATS_NKEY_CREDS.split("\n");
    creds = {
      nkey: args[1],
      sigCB: (nonce: Uint8Array) => {
        const sk = nkeys.fromSeed(Buffer.from(args[0]));
        return sk.sign(nonce);
      },
    };
  }

  console.log("Creating new NATS connection");
  natsClient = await nats.connect({
    servers: [env.EVENTS_NATS_SERVER],
    ...creds,
  });

  await setupStreams(natsClient);
  return natsClient;
}
