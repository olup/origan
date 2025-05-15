import type * as nats from "@nats-io/transport-node";
import { eq, sql } from "drizzle-orm";
import { db } from "../../libs/db/index.js";
import { buildSchema } from "../../libs/db/schema.js";
import { subjects } from "../../libs/nats-subjects.js";
import { getNatsClient } from "../../libs/nats.js";
import type { BuildEvent, BuildLogEntry, LogBatch } from "./types.js";

export class BuildEventsDatabaseConsumer {
  client: nats.NatsConnection;
  statusSubscription: nats.Subscription | undefined;
  logsSubscription: nats.Subscription | undefined;

  batchSize = 50;
  flushIntervalMs = 5000;

  private logBatches: Map<string, LogBatch> = new Map();
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(
    nc: nats.NatsConnection,
    options?: {
      batchSize?: number;
      flushIntervalMs?: number;
    }
  ) {
    this.client = nc;

    if (options?.batchSize) this.batchSize = options.batchSize;
    if (options?.flushIntervalMs)
      this.flushIntervalMs = options.flushIntervalMs;
  }

  getStatusSubject(buildId = "*") {
    return subjects.builds.status(buildId);
  }

  getLogsSubject(buildId = "*") {
    return subjects.builds.logs(buildId);
  }

  async start() {
    if (this.statusSubscription || this.logsSubscription) {
      throw new Error("Consumer already running");
    }

    console.log(
      "Starting build events consumer for status on subject:",
      this.getStatusSubject()
    );
    this.statusSubscription = this.client.subscribe(this.getStatusSubject());

    console.log(
      "Starting build events consumer for logs on subject:",
      this.getLogsSubject()
    );
    this.logsSubscription = this.client.subscribe(this.getLogsSubject());

    this.flushInterval = setInterval(
      () => this.flushAllLogBatches(),
      this.flushIntervalMs
    );

    this.processStatusMessages().catch((err) => {
      console.error("Error processing build status events:", err);
    });

    this.processLogMessages().catch((err) => {
      console.error("Error processing build log events:", err);
    });
  }

  private async processStatusMessages() {
    if (!this.statusSubscription) {
      throw new Error("No status subscription available");
    }

    for await (const msg of this.statusSubscription) {
      try {
        const event = JSON.parse(msg.data.toString()) as BuildEvent;
        console.log(
          `Received build status event: ${event.buildId} - ${event.status}`
        );

        await this.handleBuildStatusEvent(event);
      } catch (error) {
        console.error("Error processing build status message:", error);
      }
    }
  }

  private async processLogMessages() {
    if (!this.logsSubscription) {
      throw new Error("No logs subscription available");
    }

    for await (const msg of this.logsSubscription) {
      try {
        const log = JSON.parse(msg.data.toString()) as BuildLogEntry;
        const subject = msg.subject;
        const parts = subject.split(".");
        const buildId = parts[parts.length - 2];

        await this.addLogToBatch(buildId, log);
      } catch (error) {
        console.error("Error processing build log message:", error);
      }
    }
  }

  private async addLogToBatch(buildId: string, log: BuildLogEntry) {
    let batch = this.logBatches.get(buildId);
    if (!batch) {
      batch = { buildId, logs: [], lastFlush: Date.now() };
      this.logBatches.set(buildId, batch);
    }

    batch.logs.push(log);

    if (batch.logs.length >= this.batchSize) {
      await this.flushLogBatch(buildId);
    }
  }

  private async flushLogBatch(buildId: string) {
    const batch = this.logBatches.get(buildId);
    if (!batch || batch.logs.length === 0) return;

    try {
      const logs = [...batch.logs];
      console.log(`Flushing batch of ${logs.length} logs for build ${buildId}`);

      const logsJson = logs.map((log) => JSON.stringify(log));

      console.log({ logsJson });

      await db.transaction(async (tx) => {
        const field = await tx
          .update(buildSchema)
          .set({
            logs: sql`${buildSchema.logs} || jsonb_build_array(${sql.join(
              logsJson.map((log) => sql`${log}::jsonb`),
              sql`,`
            )})`,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(buildSchema.id, buildId))
          .returning();

        if (field.length === 0) {
          console.error(`No build found with ID ${buildId} for log flush`);
        }

        console.log(
          `Flushed ${logs.length} logs for build ${buildId} to database`
        );
      });

      batch.logs = [];
      batch.lastFlush = Date.now();
    } catch (error) {
      console.error(`Error flushing log batch for build ${buildId}:`, error);
    }
  }

  private async flushAllLogBatches() {
    console.log(`Flushing all log batches (${this.logBatches.size} builds)`);

    const now = Date.now();
    const buildIds = [...this.logBatches.keys()];

    for (const buildId of buildIds) {
      const batch = this.logBatches.get(buildId);
      if (!batch) continue;

      if (
        batch.logs.length > 0 &&
        now - batch.lastFlush >= this.flushIntervalMs
      ) {
        await this.flushLogBatch(buildId);
      }
    }
  }

  private async handleBuildStatusEvent(event: BuildEvent): Promise<void> {
    const { buildId, status, message } = event;
    console.log(`[Build Event Consumer] ${buildId} - ${status}: ${message}`);

    try {
      await db
        .update(buildSchema)
        .set({
          // FIXME better shared typing for status
          status,
        })
        .where(eq(buildSchema.id, buildId));

      console.log(`Updated build ${buildId} status to ${status} in database`);
    } catch (error) {
      console.error(
        `Error updating build ${buildId} status in database:`,
        error
      );
    }
  }

  async stop() {
    await this.flushAllLogBatches();

    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    if (this.statusSubscription) {
      this.statusSubscription.unsubscribe();
      this.statusSubscription = undefined;
    }

    if (this.logsSubscription) {
      this.logsSubscription.unsubscribe();
      this.logsSubscription = undefined;
    }
  }
}

let buildEventsDatabaseConsumerInstance: BuildEventsDatabaseConsumer | null =
  null;

export async function startBuildEventsConsumer(options?: {
  batchSize?: number;
  flushIntervalMs?: number;
}): Promise<BuildEventsDatabaseConsumer> {
  if (!buildEventsDatabaseConsumerInstance) {
    const nc = await getNatsClient();
    buildEventsDatabaseConsumerInstance = new BuildEventsDatabaseConsumer(
      nc,
      options
    );
    await buildEventsDatabaseConsumerInstance.start();
  }
  return buildEventsDatabaseConsumerInstance;
}
