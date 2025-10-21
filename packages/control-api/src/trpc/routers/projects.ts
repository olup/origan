import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getLogger } from "../../instrumentation.js";
import { db } from "../../libs/db/index.js";
import { organizationSchema, projectSchema } from "../../libs/db/schema.js";
import {
  projectCreateSchema,
  projectUpdateSchema,
} from "../../schemas/project.js";
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
    .query(async ({ input }) => {
      // Get organization by reference
      const [organization] = await db
        .select()
        .from(organizationSchema)
        .where(eq(organizationSchema.reference, input.organizationReference))
        .limit(1);

      if (!organization) {
        throw new Error("Organization not found");
      }

      // TODO: Add organization membership check in service layer
      const projects = await getProjects(organization.id);
      return projects;
    }),

  // Create a new project
  create: protectedProcedure
    .input(projectCreateSchema)
    .mutation(async ({ input, ctx }) => {
      const [organization] = await db
        .select()
        .from(organizationSchema)
        .where(eq(organizationSchema.reference, input.organizationReference))
        .limit(1);

      if (!organization) {
        throw new Error("Organization not found");
      }

      const result = await createProjectWithProdTrack({
        ...input,
        organizationId: organization.id,
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
    .query(async ({ input }) => {
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

      if (!project) {
        throw new Error(`No project found with reference ${input.reference}`);
      }

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
    .mutation(async ({ input }) => {
      const { reference, ...updateData } = input;

      const existingProject = await db.query.projectSchema.findFirst({
        where: eq(projectSchema.reference, reference),
      });

      if (!existingProject) {
        throw new Error(`No project found with reference ${reference}`);
      }

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
    .mutation(async () => {
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

      const project = await db.query.projectSchema.findFirst({
        where: eq(projectSchema.reference, reference),
      });

      if (!project) {
        throw new Error("Project not found");
      }

      const githubConfig = await setProjectGithubConfig(
        reference,
        project.organizationId,
        ctx.userId, // Still need userId for GitHub installation lookup
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
    .mutation(async ({ input }) => {
      const project = await db.query.projectSchema.findFirst({
        where: eq(projectSchema.reference, input.reference),
      });

      if (!project) {
        throw new Error(`No project found with reference ${input.reference}`);
      }

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
    .mutation(async ({ input }) => {
      const log = getLogger();

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
    .query(async ({ input }) => {
      // Convert reference to ID
      const project = await db.query.projectSchema.findFirst({
        where: eq(projectSchema.reference, input.projectReference),
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Project not found: ${input.projectReference}`,
        });
      }

      // Call service with ID
      const tracks = await getTracksForProject(project.id);
      return tracks;
    }),
});
