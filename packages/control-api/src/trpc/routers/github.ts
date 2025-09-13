import { verify } from "@octokit/webhooks-methods";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../config.js";
import { getLogger } from "../../instrumentation.js";
import { db } from "../../libs/db/index.js";
import { githubAppInstallationSchema } from "../../libs/db/schema.js";
import {
  getRepoBranches,
  handleInstallationCreated,
  handleInstallationDeleted,
  handlePushEvent,
  listInstallationRepositories,
} from "../../service/github.service.js";
import { protectedProcedure, publicProcedure, router } from "../init.js";

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

export const githubRouter = router({
  // Webhook endpoint
  webhook: publicProcedure
    .input(
      z.object({
        signature: z.string(),
        event: z.string(),
        delivery: z.string().optional(),
        body: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const log = getLogger();

      const isValid = await verify(
        env.GITHUB_WEBHOOK_SECRET,
        input.body,
        input.signature,
      );
      if (!isValid) {
        log.warn("Invalid webhook signature received.");
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid signature",
        });
      }

      log.info(
        `Received GitHub event: ${input.event} (Delivery: ${input.delivery})`,
      );

      let payload: unknown;
      try {
        payload = JSON.parse(input.body);
      } catch (error) {
        log.withError(error).error("Failed to parse webhook payload");
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid JSON payload",
        });
      }

      if (input.event === "installation") {
        const installationEventPayload =
          InstallationEventPayloadSchema.parse(payload);

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
      } else if (input.event === "push") {
        const pushEventPayload = PushEventPayloadSchema.parse(payload);

        if (!pushEventPayload.head_commit?.id) {
          log.info("Push event without head_commit, skipping.");
          return { received: true };
        }

        await handlePushEvent(
          pushEventPayload as Omit<
            z.infer<typeof PushEventPayloadSchema>,
            "head_commit"
          > & {
            head_commit: { id: string };
          },
        );
      } else {
        log.info(`Received unhandled event type: ${input.event}`);
      }

      return { received: true };
    }),

  // List repositories for the authenticated user
  listRepos: protectedProcedure.query(async ({ ctx }) => {
    const log = getLogger();

    // Find GitHub app installation for this user
    const installation = await db.query.githubAppInstallationSchema.findFirst({
      where: eq(githubAppInstallationSchema.userId, ctx.userId),
    });

    if (!installation) {
      log.error(`No GitHub App installation found for user ID: ${ctx.userId}`);
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "GitHub App not installed or installation ID missing.",
      });
    }

    const githubRepositories = await listInstallationRepositories(
      installation.githubInstallationId,
    );

    const repositories = githubRepositories.map((repo) => ({
      id: repo.id,
      name: repo.name,
      owner: repo.owner.login,
      fullName: repo.full_name,
    }));

    return repositories;
  }),

  // Get branches by repository ID
  getBranches: protectedProcedure
    .input(
      z.object({
        githubRepositoryId: z.number(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const _log = getLogger();

      // Find GitHub app installation for this user
      const installation = await db.query.githubAppInstallationSchema.findFirst(
        {
          where: eq(githubAppInstallationSchema.userId, ctx.userId),
        },
      );

      if (!installation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "GitHub App not installed or installation ID not valid.",
        });
      }

      const githubBranches = await getRepoBranches(
        installation.githubInstallationId,
        input.githubRepositoryId,
      );

      const branches = githubBranches.map((branch) => ({
        name: branch.name,
      }));

      return branches;
    }),
});
