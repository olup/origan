import * as nkeys from "@nats-io/nkeys";
import * as nats from "@nats-io/transport-node";
import { env } from "../config.js";

let natsClient: nats.NatsConnection | null = null;

export async function getNatsClient(): Promise<nats.NatsConnection> {
  if (natsClient) {
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

  natsClient = await nats.connect({
    servers: [env.EVENTS_NATS_SERVER],
    ...creds,
  });

  return natsClient;
}
