import { verify } from "@octokit/webhooks-methods";
import type { WebhookEventName } from "@octokit/webhooks-types";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { env } from "../config.js";
import { type Env, getLogger } from "../instrumentation.js";
import {
  handleInstallationCreated,
  handleInstallationDeleted,
  handlePushEvent,
} from "../service/github.service.js";

const InstallationEventPayloadSchema = z.object({
  action: z.enum(["created", "deleted"]),
  installation: z.object({
    id: z.number(),
    account: z.object({
      id: z.number(),
    }),
  }),
});

const PushEventPayloadSchema = z.object({
  ref: z.string(),
  repository: z.object({
    id: z.number(),
    full_name: z.string(),
  }),
  head_commit: z
    .object({
      id: z.string(),
    })
    .nullable(),
});

export const githubRouter = new Hono<Env>().post("/webhook", async (c) => {
  const log = getLogger();

  try {
    const signature = c.req.header("x-hub-signature-256");
    const event = c.req.header("x-github-event") as WebhookEventName;
    const delivery = c.req.header("x-github-delivery");
    const body = await c.req.text();

    if (!signature) {
      throw new HTTPException(400, { message: "Missing signature" });
    }

    const isValid = await verify(env.GITHUB_WEBHOOK_SECRET, body, signature);
    if (!isValid) {
      log.warn("Invalid webhook signature received.");
      throw new HTTPException(401, { message: "Invalid signature" });
    }

    log.info(`Received GitHub event: ${event} (Delivery: ${delivery})`);

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      log.withError(error).error("Failed to parse webhook payload");
      throw new HTTPException(400, { message: "Invalid JSON payload" });
    }

    if (event === "installation") {
      // Extract needed data from the payload
      // The event itself contains much more, cf https://docs.github.com/en/webhooks/webhook-events-and-payloads#installation
      const installationEventPayload =
        InstallationEventPayloadSchema.parse(payload);

      try {
        if (installationEventPayload.action === "created") {
          await handleInstallationCreated({
            installationId: installationEventPayload.installation.id,
            githubAccountId:
              installationEventPayload.installation.account.id.toString(),
          });
        } else if (installationEventPayload.action === "deleted") {
          await handleInstallationDeleted({
            installationId: installationEventPayload.installation.id,
            githubAccountId:
              installationEventPayload.installation.account.id.toString(),
          });
        } else {
          log.info(
            `Unhandled installation action: ${installationEventPayload.action}`,
          );
        }
      } catch (error) {
        log.withError(error).error("Error handling installation event");
        throw new HTTPException(500, { message: "Internal server error" });
      }
    } else if (event === "push") {
      const pushEventPayload = PushEventPayloadSchema.parse(payload);

      if (!pushEventPayload.head_commit?.id) {
        log.info("Push event without head_commit, skipping.");
        return c.json({ received: true });
      }

      try {
        await handlePushEvent(
          // Typing is needed here because we know we have head_commit
          pushEventPayload as Omit<
            z.infer<typeof PushEventPayloadSchema>,
            "head_commit"
          > & {
            head_commit: { id: string };
          },
        );
      } catch (error) {
        log.withError(error).error("Error handling push event");
        throw new HTTPException(500, { message: "Internal server error" });
      }
    } else {
      log.info(`Received unhandled event type: ${event}`);
    }

    return c.json({ received: true });
  } catch (error) {
    log.withError(error).error("Error processing GitHub webhook");
    return c.json({ error: "Internal server error" }, 500);
  }
});
