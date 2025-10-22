import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getLogger } from "../../instrumentation.js";
import { db } from "../../libs/db/index.js";
import {
  githubAppInstallationSchema,
  projectSchema,
} from "../../libs/db/schema.js";
import {
  getRepoBranches,
  listInstallationRepositories,
} from "../../service/github.service.js";
import {
  createBranchRule,
  deleteBranchRule,
  listBranchRules,
  resolveBranchRule,
  updateBranchRule,
} from "../../service/github-branch-rule.service.js";
import { protectedProcedure, router } from "../init.js";

export const githubRouter = router({
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
        commitSha: branch.commit?.sha,
      }));

      return branches;
    }),

  listBranchRules: protectedProcedure
    .input(
      z.object({
        projectReference: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      const project = await db.query.projectSchema.findFirst({
        where: eq(projectSchema.reference, input.projectReference),
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Project not found: ${input.projectReference}`,
        });
      }

      const rules = await listBranchRules(project.id);
      return rules;
    }),

  createBranchRule: protectedProcedure
    .input(
      z.object({
        projectReference: z.string().min(1),
        branchPattern: z.string().min(1),
        environmentId: z.string().uuid(),
        enablePreviews: z.boolean().optional(),
        isPrimary: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const project = await db.query.projectSchema.findFirst({
        where: eq(projectSchema.reference, input.projectReference),
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Project not found: ${input.projectReference}`,
        });
      }

      const rule = await createBranchRule({
        projectId: project.id,
        branchPattern: input.branchPattern,
        environmentId: input.environmentId,
        enablePreviews: input.enablePreviews,
        isPrimary: input.isPrimary,
      });

      return rule;
    }),

  updateBranchRule: protectedProcedure
    .input(
      z.object({
        projectReference: z.string().min(1),
        ruleId: z.string().uuid(),
        branchPattern: z.string().optional(),
        environmentId: z.string().uuid().optional(),
        enablePreviews: z.boolean().optional(),
        isPrimary: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const project = await db.query.projectSchema.findFirst({
        where: eq(projectSchema.reference, input.projectReference),
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Project not found: ${input.projectReference}`,
        });
      }

      const updatedRule = await updateBranchRule(project.id, input.ruleId, {
        branchPattern: input.branchPattern,
        environmentId: input.environmentId,
        enablePreviews: input.enablePreviews,
        isPrimary: input.isPrimary,
      });

      return updatedRule;
    }),

  deleteBranchRule: protectedProcedure
    .input(
      z.object({
        projectReference: z.string().min(1),
        ruleId: z.string().uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      const project = await db.query.projectSchema.findFirst({
        where: eq(projectSchema.reference, input.projectReference),
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Project not found: ${input.projectReference}`,
        });
      }

      await deleteBranchRule(project.id, input.ruleId);
      return { success: true };
    }),

  resolveBranchRule: protectedProcedure
    .input(
      z.object({
        projectReference: z.string().min(1),
        branchName: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      const project = await db.query.projectSchema.findFirst({
        where: eq(projectSchema.reference, input.projectReference),
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Project not found: ${input.projectReference}`,
        });
      }

      const resolution = await resolveBranchRule(project.id, input.branchName);
      return resolution;
    }),
});
