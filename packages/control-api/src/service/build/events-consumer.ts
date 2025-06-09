import {
  type BuildEvent,
  type BuildLogEntry,
  type Msg,
  NatsClient,
  type Subscription,
} from "@origan/nats";
import { eq, sql } from "drizzle-orm";
import { log } from "../../instrumentation.js";
import { env } from "../../config.js";
import { db } from "../../libs/db/index.js";
import { buildSchema, type buildStatusEnum } from "../../libs/db/schema.js";

interface LogBatch {
  buildId: string;
  logs: BuildLogEntry[];
  lastFlush: number;
}

export class BuildEventsDatabaseConsumer {
  private natsClient: NatsClient;
  private statusSubscription: Subscription | undefined;
  private logsSubscription: Subscription | undefined;

  batchSize = 50;
  flushIntervalMs = 5000;

  private logBatches: Map<string, LogBatch> = new Map();
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(options?: { batchSize?: number; flushIntervalMs?: number }) {
    this.natsClient = new NatsClient({
      server: env.EVENTS_NATS_SERVER,
      nkeyCreds: env.EVENTS_NATS_NKEY_CREDS,
    });

    if (options?.batchSize) this.batchSize = options.batchSize;
    if (options?.flushIntervalMs)
      this.flushIntervalMs = options.flushIntervalMs;
  }

  async start() {
    if (this.statusSubscription || this.logsSubscription) {
      throw new Error("Consumer already running");
    }

    await this.natsClient.connect();

    log.info("Starting build events consumer");

    this.statusSubscription = await this.natsClient.subscriber.onBuildStatus(
      async (event: BuildEvent) => {
        await this.handleBuildStatusEvent(event);
      },
    );

    this.logsSubscription = await this.natsClient.subscriber.onBuildLog(
      async (log: BuildLogEntry, msg: Msg) => {
        const parts = msg.subject.split(".");
        const buildId = parts[parts.length - 2];
        await this.addLogToBatch(buildId, log);
      },
    );

    this.flushInterval = setInterval(
      () => this.flushAllLogBatches(),
      this.flushIntervalMs,
    );
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
      log.info(`Flushing batch of ${logs.length} logs for build ${buildId}`);

      const logsJson = logs.map((log) => JSON.stringify(log));

      await db.transaction(async (tx) => {
        const field = await tx
          .update(buildSchema)
          .set({
            logs: sql`${buildSchema.logs} || jsonb_build_array(${sql.join(
              logsJson.map((log) => sql`${log}::jsonb`),
              sql`,`,
            )})`,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(buildSchema.id, buildId))
          .returning();

        if (field.length === 0) {
          log.error(`No build found with ID ${buildId} for log flush`);
        }

        log.info(
          `Flushed ${logs.length} logs for build ${buildId} to database`,
        );
      });

      this.logBatches.delete(buildId);
    } catch (error) {
      log
        .withError(error)
        .error(`Error flushing log batch for build ${buildId}`);
    }
  }

  private async flushAllLogBatches() {
    const now = Date.now();
    const buildIds = [...this.logBatches.keys()];

    const buildsToFlush = buildIds.filter((buildId) => {
      const batch = this.logBatches.get(buildId);
      return (
        batch &&
        batch.logs.length > 0 &&
        now - batch.lastFlush >= this.flushIntervalMs
      );
    });

    if (buildsToFlush.length > 0) {
      log.info(`Flushing log batches (${buildsToFlush.length} builds)`);
    }

    for (const buildId of buildsToFlush) {
      await this.flushLogBatch(buildId);
    }
  }

  private async handleBuildStatusEvent(event: BuildEvent): Promise<void> {
    const { buildId, status, message } = event;
    log.info(`[Build Event Consumer] ${buildId} - ${status}: ${message}`);

    try {
      const updateData: Record<string, unknown> = {
        status: status as (typeof buildStatusEnum.enumValues)[number],
      };

      // Update timestamp fields based on build status
      if (status === "in_progress") {
        updateData.buildStartedAt = new Date();
      } else if (status === "completed" || status === "failed") {
        updateData.buildEndedAt = new Date();
      }

      await db
        .update(buildSchema)
        .set(updateData)
        .where(eq(buildSchema.id, buildId));

      log.info(`Updated build ${buildId} status to ${status} in database`);
    } catch (error) {
      log
        .withError(error)
        .error(`Error updating build ${buildId} status in database`);
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
    buildEventsDatabaseConsumerInstance = new BuildEventsDatabaseConsumer(
      options,
    );
    await buildEventsDatabaseConsumerInstance.start();
  }
  return buildEventsDatabaseConsumerInstance;
}
