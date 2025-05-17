import type { JetStreamClient } from "@nats-io/jetstream";
import { subjects } from "./subjects";
import type { BuildEvent, BuildLogEntry, DeploymentLogEvent } from "./types";

export class Publisher {
  constructor(private js: JetStreamClient) {}

  async publishBuildStatus(event: BuildEvent): Promise<void> {
    try {
      await this.js.publish(
        subjects.builds.status(event.buildId),
        this.encode(event),
      );
    } catch (error) {
      console.error("Error publishing build status:", error);
      throw error;
    }
  }

  async publishBuildLog(buildId: string, log: BuildLogEntry): Promise<void> {
    try {
      await this.js.publish(subjects.builds.logs(buildId), this.encode(log));
    } catch (error) {
      console.error("Error publishing build log:", error);
      throw error;
    }
  }

  async publishDeploymentLog(log: DeploymentLogEvent): Promise<void> {
    try {
      await this.js.publish(
        subjects.deployments.logs(log.projectId, log.deploymentId),
        this.encode(log),
      );
    } catch (error) {
      console.error("Error publishing deployment log:", error);
      throw error;
    }
  }

  private encode(data: unknown): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(data));
  }
}
