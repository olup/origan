import { jetstream } from "jsr:@nats-io/jetstream";
import * as nkeys from "jsr:@nats-io/nkeys";
import * as nats from "jsr:@nats-io/transport-deno";
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
    sigCB: (nonce: Uint8Array) => {
      const sk = nkeys.fromSeed(Buffer.from(args[0]));
      return sk.sign(nonce);
    },
  };
}

const nc = await nats.connect({ servers: [natsServer], ...credsArgs });
console.log(`Connected to NATS server ${natsServer}`);
console.log("Connecting to JetStream");
const js = jetstream(nc);

const eventManager = new globalThis.EventManager();

console.log("event manager running");
console.log("oh oh oh");

for await (const data of eventManager) {
  if (!data) {
    continue;
  }

  if (!data.metadata.service_path) {
    console.warn("event without service_path, skipping");
    console.dir(data, { depth: Number.POSITIVE_INFINITY });
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
      const message = {
        timestamp: data.timestamp,
        msg: data.event.msg,
        level: data.event.level,
      };
      console.log(`Publishing log to ${topic}:`, message);
      await js.publish(topic, JSON.stringify(message));
      // TODO: Capture acknoledgement, to make sure that when exiting, everything has been properly
      // sent.
    } catch (e) {
      console.error("Error publishing to NATS:", e);
    }
  }
  console.dir(data, { depth: Number.POSITIVE_INFINITY });
}

console.log("event manager exiting..");
nc.drain();
console.log("event manager done exiting");
