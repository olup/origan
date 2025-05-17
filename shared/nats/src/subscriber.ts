import type {
  Msg,
  NatsConnection,
  Subscription,
} from "@nats-io/nats-core/lib/core";
import { subjects } from "./subjects";
import type { BuildEvent, BuildLogEntry, DeploymentLogEvent } from "./types";

export class Subscriber {
  constructor(private client: NatsConnection) {}

  async onBuildStatus(
    handler: (event: BuildEvent, msg: Msg) => Promise<void>,
    buildId?: string,
  ): Promise<Subscription> {
    try {
      const subject = subjects.builds.status(buildId);
      const subscription = await this.client.subscribe(subject);
      this.handleMessages(subscription, handler);
      return subscription;
    } catch (error) {
      console.error("Error subscribing to build status:", error);
      throw error;
    }
  }

  async onBuildLog(
    handler: (log: BuildLogEntry, msg: Msg) => Promise<void>,
    buildId?: string,
  ): Promise<Subscription> {
    try {
      const subject = subjects.builds.logs(buildId);
      const subscription = await this.client.subscribe(subject);
      this.handleMessages(subscription, handler);
      return subscription;
    } catch (error) {
      console.error("Error subscribing to build logs:", error);
      throw error;
    }
  }

  async onDeploymentLog(
    handler: (log: DeploymentLogEvent, msg: Msg) => Promise<void>,
    projectId: string,
    deploymentId: string,
  ): Promise<Subscription> {
    try {
      const subject = subjects.deployments.logs(projectId, deploymentId);
      const subscription = await this.client.subscribe(subject);
      this.handleMessages(subscription, handler);
      return subscription;
    } catch (error) {
      console.error("Error subscribing to deployment logs:", error);
      throw error;
    }
  }

  private handleMessages<T>(
    subscription: Subscription,
    handler: (data: T, msg: Msg) => Promise<void>,
  ): void {
    (async () => {
      for await (const msg of subscription) {
        try {
          const data = this.decode<T>(msg);
          await handler(data, msg);
        } catch (error) {
          console.error("Error handling message:", error);
        }
      }
    })().catch((error) => {
      console.error("Error in message handler:", error);
    });
  }

  private decode<T>(msg: Msg): T {
    const decoder = new TextDecoder();
    const data = decoder.decode(msg.data);
    return JSON.parse(data) as T;
  }
}
