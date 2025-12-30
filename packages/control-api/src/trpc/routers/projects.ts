import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getLogger } from "../../instrumentation.js";
import { db } from "../../libs/db/index.js";
import { projectSchema } from "../../libs/db/schema.js";
import {
  projectCreateSchema,
  projectUpdateSchema,
} from "../../schemas/project.js";
import {
  getOrgWithAccessCheck,
  getProjectWithAccessCheck,
} from "../../service/authorization.service.js";
import { triggerBuildTask } from "../../service/build/index.js";
import { getRepoBranches } from "../../service/github.service.js";
import {
  createProjectWithProdTrack,
  getProjects,
  removeProjectGithubConfig,
  setProjectGithubConfig,
  updateProject,
} from "../../service/project.service.js";
import { getTracksForProject } from "../../service/track.service.js";
import { protectedProcedure, router } from "../init.js";

export const projectsRouter = router({
  // Get projects for a specific organization
  list: protectedProcedure
    .input(
      z.object({
        organizationReference: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const org = await getOrgWithAccessCheck(
        ctx.userId,
        input.organizationReference,
      );
      const projects = await getProjects(org.id);
      return projects;
    }),

  // Create a new project
  create: protectedProcedure
    .input(projectCreateSchema)
    .mutation(async ({ input, ctx }) => {
      const org = await getOrgWithAccessCheck(
        ctx.userId,
        input.organizationReference,
      );

      const result = await createProjectWithProdTrack({
        ...input,
        organizationId: org.id,
        creatorId: ctx.userId,
      });
      return result.project;
    }),

  // Get a single project by reference
  get: protectedProcedure
    .input(
      z.object({
        reference: z.string().min(1),
      }),
    )
    .query(async ({ input, ctx }) => {
      // First check access
      await getProjectWithAccessCheck(ctx.userId, input.reference);

      // Then fetch with relations
      const project = await db.query.projectSchema.findFirst({
        where: eq(projectSchema.reference, input.reference),
        with: {
          deployments: {
            with: {
              domains: true,
            },
          },
          githubConfig: true,
        },
      });

      return project;
    }),

  // Update a project
  update: protectedProcedure
    .input(
      z.object({
        reference: z.string().min(1),
        ...projectUpdateSchema.shape,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { reference, ...updateData } = input;

      const existingProject = await getProjectWithAccessCheck(
        ctx.userId,
        reference,
      );

      const project = await updateProject(
        existingProject.id,
        existingProject.organizationId,
        updateData,
      );
      return project;
    }),

  // Delete a project
  delete: protectedProcedure
    .input(
      z.object({
        reference: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await getProjectWithAccessCheck(ctx.userId, input.reference);

      // TODO - Implementation pending
      // Delete each remaining deployment (which involves cleaning the directory in s3)
      // Delete any remaining domain object (which involves cleaning any certificates we might have)
      throw new Error("Not implemented yet");
    }),

  // GitHub Configuration
  setGithubConfig: protectedProcedure
    .input(
      z.object({
        reference: z.string().min(1),
        githubRepositoryId: z.number(),
        githubRepositoryFullName: z.string(),
        productionBranchName: z.string().min(1),
        projectRootPath: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { reference, productionBranchName, ...githubData } = input;

      const project = await getProjectWithAccessCheck(ctx.userId, reference);

      const githubConfig = await setProjectGithubConfig(
        reference,
        project.organizationId,
        ctx.userId,
        githubData,
        productionBranchName,
      );
      return githubConfig;
    }),

  removeGithubConfig: protectedProcedure
    .input(
      z.object({
        reference: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const project = await getProjectWithAccessCheck(
        ctx.userId,
        input.reference,
      );

      await removeProjectGithubConfig(project.id, project.organizationId);
      return { success: true };
    }),

  // Trigger a manual deployment for a specific branch
  triggerDeploy: protectedProcedure
    .input(
      z.object({
        projectRef: z.string().min(1),
        branch: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const log = getLogger();

      // Check access first
      await getProjectWithAccessCheck(ctx.userId, input.projectRef);

      // Get the project with GitHub config
      const project = await db.query.projectSchema.findFirst({
        where: eq(projectSchema.reference, input.projectRef),
        with: {
          githubConfig: {
            with: {
              githubAppInstallation: true,
            },
          },
        },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Project not found: ${input.projectRef}`,
        });
      }

      if (!project.githubConfig) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "GitHub integration not configured for this project",
        });
      }

      if (!project.githubConfig.githubAppInstallation) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "GitHub App not installed for this project",
        });
      }

      // Get the latest commit SHA for the selected branch
      const branches = await getRepoBranches(
        project.githubConfig.githubAppInstallation.githubInstallationId,
        project.githubConfig.githubRepositoryId,
      );

      const selectedBranch = branches.find((b) => b.name === input.branch);
      if (!selectedBranch || !selectedBranch.commit?.sha) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Branch not found or has no commits: ${input.branch}`,
        });
      }

      log.info(
        `Manually triggering deployment for project ${project.name} on branch ${input.branch} at commit ${selectedBranch.commit.sha}`,
      );

      // Trigger the build task
      const buildTaskResult = await triggerBuildTask(
        project.id,
        input.branch,
        selectedBranch.commit.sha,
        {
          triggerSource: "api",
        },
      );

      if (buildTaskResult?.error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: buildTaskResult.error,
        });
      }

      return {
        success: true,
        buildReference: buildTaskResult,
      };
    }),

  // List tracks for a project
  listTracks: protectedProcedure
    .input(
      z.object({
        projectReference: z.string().min(1),
      }),
    )
    .query(async ({ input, ctx }) => {
      const project = await getProjectWithAccessCheck(
        ctx.userId,
        input.projectReference,
      );

      const tracks = await getTracksForProject(project.id);
      return tracks;
    }),
});
