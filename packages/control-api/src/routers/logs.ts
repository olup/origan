import { zValidator } from "@hono/zod-validator";
import { NatsClient } from "@origan/nats";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { env } from "../config.js";
import { auth } from "../middleware/auth.js";
import { getDeployment } from "../service/deployment.service.js";

export const logsRouter = new Hono().get(
  "/stream/:deploymentId",
  auth(),
  zValidator("param", z.object({ deploymentId: z.string() })),
  async (c) => {
    const nc = new NatsClient({
      server: env.EVENTS_NATS_SERVER,
      nkeyCreds: env.EVENTS_NATS_NKEY_CREDS,
    });
    await nc.connect();

    const { deploymentId } = c.req.valid("param");

    const deployment = await getDeployment({
      userId: c.get("userId"),
      id: deploymentId,
    });
    if (!deployment) {
      return c.json({ error: "Deployment not found" }, 404);
    }

    return streamSSE(c, async (stream) => {
      const subscription = await nc.subscriber.onDeploymentLog(
        async (log, msg) => {
          await stream.writeSSE({
            data: JSON.stringify(log),
            event: "log-entry",
            id: msg.sid.toString(),
          });
        },
        deployment.projectId,
        deploymentId,
      );

      stream.onAbort(async () => {
        if (subscription) {
          subscription.unsubscribe();
        }
        await nc.disconnect();
      });
    });
  },
);
