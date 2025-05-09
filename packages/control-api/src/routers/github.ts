import { verify } from "@octokit/webhooks-methods";
import type { WebhookEventName } from "@octokit/webhooks-types";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { env } from "../config.js";
import { db } from "../libs/db/index.js";
import { userSchema } from "../libs/db/schema.js";
import { auth } from "../middleware/auth.js";
import {
  getRepoBranches,
  handleInstallationCreated,
  handleInstallationDeleted,
  listInstallationRepositories,
} from "../service/github.service.js";

const installationEventPayloadSchema = z.object({
  action: z.enum(["created", "deleted"]),
  installation: z.object({
    id: z.number(),
    account: z.object({
      id: z.number(),
    }),
  }),
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
        console.warn("Invalid webhook signature received.");
        throw new HTTPException(401, { message: "Invalid signature" });
      }

      console.log(`Received GitHub event: ${event} (Delivery: ${delivery})`);

      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch (error) {
        console.error("Failed to parse webhook payload:", error);
        throw new HTTPException(400, { message: "Invalid JSON payload" });
      }

      if (event === "installation") {
        // Extract needed data from the payload
        // The event itself contains much more, cf https://docs.github.com/en/webhooks/webhook-events-and-payloads#installation
        const installationEventPayload =
          installationEventPayloadSchema.parse(payload);

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
            console.log(
              `Unhandled installation action: ${installationEventPayload.action}`,
            );
          }
        } catch (error) {
          console.error("Error handling installation event:", error);
          throw new HTTPException(500, { message: "Internal server error" });
        }
      } else {
        console.log(`Received unhandled event type: ${event}`);
      }

      return c.json({ received: true });
    } catch (error) {
      console.error("Error processing GitHub webhook:", error);
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
        console.error(
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
      }));

      return c.json(repositories);
    } catch (error) {
      console.error(
        `Unexpected error fetching installation repositories for user ${userId}:`,
        error,
      );

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
      console.error(
        `Error fetching branches for repository ${githubRepositoryId} for user ${userId}:`,
        error,
      );
      if (error instanceof HTTPException) {
        throw error;
      }

      throw new HTTPException(500, {
        message: "Failed to retrieve branches",
      });
    }
  });
