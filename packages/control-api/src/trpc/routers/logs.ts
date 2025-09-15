import { EventEmitter, on } from "node:events";
import type { DeploymentLogEvent } from "@origan/nats";
import { NatsClient } from "@origan/nats";
import { z } from "zod";
import { env } from "../../config.js";
import { getDeployment } from "../../service/deployment.service.js";
import { protectedProcedure, router } from "../init.js";

export const logsRouter = router({
  stream: protectedProcedure
    .input(
      z.object({
        deploymentRef: z.string(),
        functionHash: z.string().optional(),
      }),
    )
    .subscription(async function* ({ input, signal }) {
      const deployment = await getDeployment({
        reference: input.deploymentRef,
      });

      if (!deployment) {
        throw new Error("Deployment not found");
      }

      // Check user has access to this deployment's project
      // TODO: Add proper access control check

      let nc: NatsClient | null = null;

      try {
        nc = new NatsClient({
          server: env.EVENTS_NATS_SERVER,
          nkeyCreds: env.EVENTS_NATS_NKEY_CREDS,
        });

        await nc.connect();
        console.log(
          `Connected to NATS for logs subscription - Project: ${deployment.projectId}, Deployment: ${deployment.id}, FunctionHash: ${input.functionHash || "*"}`,
        );

        // Use EventEmitter to bridge callback to async iterator
        const emitter = new EventEmitter();

        // Subscribe to NATS
        const subscription = await nc.subscriber.onDeploymentLog(
          async (log) => {
            console.log("Received log from NATS:", log);

            const logEvent: DeploymentLogEvent = {
              timestamp: log.timestamp,
              level: log.level,
              message: log.message,
              projectId: deployment.projectId,
              deploymentId: deployment.id,
              functionPath: log.functionPath,
            };

            emitter.emit("log", logEvent);
          },
          deployment.projectId,
          deployment.id,
          input.functionHash,
        );

        console.log(
          `Subscribed to topic: logs.${deployment.projectId}.${deployment.id}.${input.functionHash || "*"}`,
        );

        // Create async iterator from events
        const logIterator = on(emitter, "log");

        try {
          for await (const [logEvent] of logIterator) {
            if (signal?.aborted) break;
            yield logEvent as DeploymentLogEvent;
          }
        } finally {
          subscription.unsubscribe();
        }
      } catch (error) {
        console.error("Error in NATS subscription:", error);
        throw error;
      } finally {
        // Cleanup
        if (nc) {
          try {
            await nc.disconnect();
          } catch (error) {
            console.error("Error disconnecting from NATS:", error);
          }
        }
      }
    }),
});
