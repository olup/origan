import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { getNatsClient } from "../libs/nats.js";
import { auth } from "../middleware/auth.js";
import { getDeployment } from "../service/deployment.service.js";
import { LogConsumer } from "../service/logs.service.js";

export const logsRouter = new Hono().get(
  "/stream/:deploymentId",
  auth(),
  zValidator("param", z.object({ deploymentId: z.string() })),
  async (c) => {
    const nc = await getNatsClient();

    const { deploymentId } = c.req.valid("param");

    const deployment = await getDeployment({
      userId: c.get("userId"),
      id: deploymentId,
    });
    if (!deployment) {
      return c.json({ error: "Deployment not found" }, 404);
    }

    return streamSSE(c, async (stream) => {
      const consumer = new LogConsumer(nc);
      stream.onAbort(async () => {
        await consumer.close();
      });

      for await (const log of await consumer.consume(
        deployment.projectId,
        deploymentId,
      )) {
        await stream.writeSSE({
          data: JSON.stringify(log.entry),
          event: "log-entry",
          id: log.id.toString(),
        });
      }
    });
  },
);
