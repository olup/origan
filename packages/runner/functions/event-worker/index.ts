import * as nats from "jsr:@nats-io/transport-deno";
import {
  DiscardPolicy,
  jetstream,
  jetstreamManager,
  StorageType,
} from "jsr:@nats-io/jetstream";
import * as nkeys from "jsr:@nats-io/nkeys";
import { Buffer } from "node:buffer";

const natsServer = Deno.env.get("EVENTS_NATS_SERVER");
if (!natsServer) {
  console.error("EVENTS_NATS_SERVER is not set");
  throw new Error("EVENTS_NATS_SERVER is not set");
}

const natsAuth = Deno.env.get("EVENTS_NATS_NKEY_CREDS");
let credsArgs = {};
if (natsAuth) {
  const args = natsAuth.split("\n");
  credsArgs = {
    nkey: args[1],
    sigCB: function (nonce: Uint8Array) {
      const sk = nkeys.fromSeed(Buffer.from(args[0]));
      return sk.sign(nonce);
    },
  };
}

const nc = await nats.connect({ servers: [natsServer], ...credsArgs });
console.log(`Connected to NATS server ${natsServer}`);
const js = jetstream(nc);
const jsm = await jetstreamManager(nc);

const streamName = Deno.env.get("EVENTS_STREAM_NAME");
if (!streamName) {
  throw new Error("EVENTS_STREAM_NAME is not set");
}

const createStream = async () => {
  await jsm.streams.add({
    name: streamName,
    subjects: ["logs.*.*", "events.*.*"],
    storage: StorageType["Memory"],
    max_age: 1000 * 1000 * 60 * 60 * 24, // 1 day, in nanoseconds
    discard: DiscardPolicy.Old,
  });
};
// FIXME: This will error out if the configuration of the stream has changed, so for now we just
// delete and recreate the stream.
// TODO: In case of a different configuration, fetch the config and update it instead of deleting
// the stream.
try {
  await createStream();
} catch (e) {
  console.error("Error creating stream:", e);
  await jsm.streams.delete(streamName);
  await createStream();
}

const eventManager = new globalThis.EventManager();

console.log("event manager running");

for await (const data of eventManager) {
  if (!data) {
    continue;
  }

  if (!data.metadata.service_path) {
    console.warn("event without service_path, skipping");
    console.dir(data, { depth: Infinity });
    continue;
  }
  // XXX: Find a better way to map a service_path or execution_id to the metadata of a deployment.
  // Some possibilities:
  // - We keep inject the information each time a request comes in, like we do now, and we
  // maybe find a better way than the service_path to identify the deployment.
  // - WorkerPath is a hash, we can store that somewhere and do the matching ourselves. The problem
  // is that we can't publish to NATS with a path that can allow to get the logs of every
  // deployments of a project, or of everything of a single deployment.
  // FIXME: This is also missing the function path, which isn't ideal
  const deploymentsPath = data.metadata.service_path.split("/");
  const deploymentId = deploymentsPath[deploymentsPath.length - 2];
  const projectId = deploymentsPath[deploymentsPath.length - 3];

  if (data.event_type === "Log") {
    const topic = `logs.${projectId}.${deploymentId}`;
    try {
      await js.publish(
        topic,
        JSON.stringify({
          timestamp: data.timestamp,
          msg: data.event.msg,
          level: data.event.level,
        }),
      );
      // TODO: Capture acknoledgement, to make sure that when exiting, everything has been properly
      // sent.
    } catch (e) {
      console.error("Error publishing to NATS:", e);
    }
  }
  console.dir(data, { depth: Infinity });
}

console.log("event manager exiting..");
nc.drain();
console.log("event manager done exiting");
