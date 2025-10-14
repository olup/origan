import * as nkeys from "jsr:@nats-io/nkeys";
import * as nats from "jsr:@nats-io/transport-deno";
import { Buffer } from "node:buffer";

async function sha1(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

// For now, use regular NATS publish instead of JetStream
// JetStream requires stream configuration which might not be set up
console.log("Using regular NATS publishing");

const eventManager = new globalThis.EventManager();

console.log("event manager running");

for await (const data of eventManager) {
  if (!data) {
    continue;
  }

  if (!data.metadata.service_path) {
    console.warn("event without service_path, skipping");
    console.dir(data, { depth: Number.POSITIVE_INFINITY });
    continue;
  }
  // Extract metadata from service_path
  const pathParts = data.metadata.service_path.split("/");
  const deploymentId = pathParts[pathParts.length - 2];
  const projectId = pathParts[pathParts.length - 3];

  // Extract function path from the last part of service_path (hash)
  // The actual function path needs to be passed through metadata
  // For now, we'll use the hash from the path as the function identifier
  const functionHash = pathParts[pathParts.length - 1];

  // TODO: Get the actual function path from metadata when available
  // For now, we'll include the hash in the message
  const functionPath =
    data.metadata.function_path || `function-${functionHash}`;

  // Handle different event types
  const topic = `logs.${projectId}.${deploymentId}.${functionHash}`;

  if (data.event_type === "Log") {
    try {
      const message = {
        timestamp: data.timestamp,
        message: data.event.msg,
        level: data.event.level,
        functionPath: functionPath, // Include clear text function path
      };
      console.log(`Publishing log to ${topic}:`, message);
      // Use regular NATS publish instead of JetStream
      nc.publish(topic, JSON.stringify(message));
    } catch (e) {
      console.error("Error publishing to NATS:", e);
    }
  } else if (data.event_type === "BootFailure") {
    // Handle boot failures as error logs
    try {
      const message = {
        timestamp: data.timestamp,
        message: `Function boot failed: ${data.event.msg}`,
        level: "error",
        functionPath: functionPath,
      };
      console.log(`Publishing boot failure to ${topic}:`, message);
      nc.publish(topic, JSON.stringify(message));
    } catch (e) {
      console.error("Error publishing to NATS:", e);
    }
  } else if (data.event_type === "UncaughtException") {
    // Handle uncaught exceptions
    try {
      const message = {
        timestamp: data.timestamp,
        message: `Uncaught exception: ${data.event.exception}`,
        level: "error",
        functionPath: functionPath,
      };
      console.log(`Publishing exception to ${topic}:`, message);
      nc.publish(topic, JSON.stringify(message));
    } catch (e) {
      console.error("Error publishing to NATS:", e);
    }
  } else if (data.event_type === "WorkerRequestCancelled") {
    // Handle request cancellation
    try {
      const message = {
        timestamp: data.timestamp,
        message: `Request cancelled: ${data.event.reason}`,
        level: "warn",
        functionPath: functionPath,
      };
      console.log(`Publishing cancellation to ${topic}:`, message);
      nc.publish(topic, JSON.stringify(message));
    } catch (e) {
      console.error("Error publishing to NATS:", e);
    }
  }

  // Log all events for debugging
  console.dir(data, { depth: Number.POSITIVE_INFINITY });
}

console.log("event manager exiting..");
nc.drain();
console.log("event manager done exiting");
