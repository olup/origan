import type * as nats from "@nats-io/transport-node";
import { subjects } from "../libs/nats-subjects.js";

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

  subscription: nats.Subscription | undefined;

  constructor(nc: nats.NatsConnection) {
    this.client = nc;
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
      subjects.deployments.logs(projectId, deploymentId),
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
