import { verify } from "@octokit/webhooks-methods";
import type { WebhookEventName } from "@octokit/webhooks-types";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { log } from "../instrumentation.js";
import { env } from "../config.js";
import { db } from "../libs/db/index.js";
import { userSchema } from "../libs/db/schema.js";
import { auth } from "../middleware/auth.js";
import {
  getRepoBranches,
  handleInstallationCreated,
  handleInstallationDeleted,
  handlePushEvent,
  listInstallationRepositories,
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

export const githubRouter = new Hono()
  .post("/webhook", async (c) => {
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
        log
          .withError(error)
          .error("Failed to parse webhook payload");
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
          log
            .withError(error)
            .error("Error handling installation event");
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
          log
            .withError(error)
            .error("Error handling push event");
          throw new HTTPException(500, { message: "Internal server error" });
        }
      } else {
        log.info(`Received unhandled event type: ${event}`);
      }

      return c.json({ received: true });
    } catch (error) {
      log
        .withError(error)
        .error("Error processing GitHub webhook");
      return c.json({ error: "Internal server error" }, 500);
    }
  })

  // List repositories for the authenticated user
  .get("/repos", auth(), async (c) => {
    const userId = c.get("userId");
    try {
      const dbUser = await db.query.userSchema.findFirst({
        where: eq(userSchema.id, userId),
        columns: {
          githubAppInstallationId: true,
        },
      });

      if (!dbUser || !dbUser.githubAppInstallationId) {
        log.error(
          `No GitHub App installation found for user ID: ${userId}`,
        );
        throw new HTTPException(404, {
          message: "GitHub App not installed or installation ID missing.",
        });
      }

      const githubRepositories = await listInstallationRepositories(
        dbUser.githubAppInstallationId,
      );

      const repositories = githubRepositories.map((repo) => ({
        id: repo.id,
        name: repo.name,
        owner: repo.owner.login,
        fullName: repo.full_name,
      }));

      return c.json(repositories);
    } catch (error) {
      log
        .withError(error)
        .error(`Unexpected error fetching installation repositories for user ${userId}`);

      if (error instanceof HTTPException) {
        throw error;
      }

      throw new HTTPException(500, {
        message: "Failed to retrieve repositories",
      });
    }
  })
  // Get branches by repository ID
  .get("/repos/:githubRepositoryId/branches", auth(), async (c) => {
    const userId = c.get("userId");
    const githubRepositoryIdString = c.req.param("githubRepositoryId");
    const githubRepositoryId = Number.parseInt(githubRepositoryIdString, 10);

    try {
      const dbUser = await db.query.userSchema.findFirst({
        where: eq(userSchema.id, userId),
        columns: {
          githubAppInstallationId: true,
        },
      });

      if (!dbUser || !dbUser.githubAppInstallationId) {
        throw new HTTPException(404, {
          message: "GitHub App not installed or installation ID not valid.",
        });
      }

      const githubBRanched = await getRepoBranches(
        dbUser.githubAppInstallationId,
        githubRepositoryId,
      );

      const branches = githubBRanched.map((branch) => ({
        name: branch.name,
      }));

      return c.json(branches);
    } catch (error) {
      log
        .withError(error)
        .error(`Error fetching branches for repository ${githubRepositoryId} for user ${userId}`);
      if (error instanceof HTTPException) {
        throw error;
      }

      throw new HTTPException(500, {
        message: "Failed to retrieve branches",
      });
    }
  });
