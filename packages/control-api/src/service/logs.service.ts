import * as nkeys from "@nats-io/nkeys";
import * as nats from "@nats-io/transport-node";

export async function getNatsClient(
  server: string,
  nkeyCreds?: string,
): Promise<nats.NatsConnection> {
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

  return await nats.connect({ servers: [server], ...creds });
}

interface LogEntry {
  msg: string;
  level: string;
}

export interface DeploymentLog {
  id: number;
  entry: LogEntry;
}

export class LogConsumer {
  client: nats.NatsConnection;
  subject_prefix: string;
  subscription: nats.Subscription | undefined;

  constructor(nc: nats.NatsConnection, subject_prefix: string) {
    this.client = nc;
    this.subject_prefix = subject_prefix;
  }

  getSubject(projectId: string, deploymentId: string) {
    return `${this.subject_prefix}.${projectId}.${deploymentId}`;
  }

  async consume(
    projectId: string,
    deploymentId: string,
  ): Promise<AsyncGenerator<DeploymentLog>> {
    if (this.subscription) {
      throw new Error("Consumer already exists");
    }
    console.log("Creating consumer");
    this.subscription = this.client.subscribe(
      this.getSubject(projectId, deploymentId),
    );
    return (async function* (sub: nats.Subscription) {
      for await (const msg of sub) {
        const log = JSON.parse(msg.data.toString()) as LogEntry;
        yield {
          id: msg.sid,
          entry: log,
        };
      }
    })(this.subscription);
  }

  async close() {
    if (!this.subscription) {
      throw new Error("Consumer not found");
    }
    console.log("I'm done");
    this.subscription.unsubscribe();
  }
}

// export async function* readDeploymentLogs(
//   nc: nats.NatsConnection,
//   streamName: string,
//   projectId: string,
//   deploymentId: string,
// ): AsyncGenerator<DeploymentLog> {
//   const js = jetstream(nc);
//   const consumer = await js.consumers.get(streamName, {
//     filter_subjects: [`logs.${projectId}.${deploymentId}`],
//   });
//
//   const messages = await consumer.consume();
//
//   try {
//     }
//   } finally {
//     console.log("Closing consumer");
//     await consumer.delete();
//   }
// }
