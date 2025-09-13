import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../libs/db/index.js";
import { projectSchema } from "../../libs/db/schema.js";
import {
  getEnvironmentByName,
  getEnvironmentsByProject,
  getLatestRevision,
  setEnvironmentVariables,
  unsetEnvironmentVariable,
} from "../../service/environment.service.js";
import { protectedProcedure, router } from "../init.js";

export const environmentsRouter = router({
  // List environments by project
  listByProject: protectedProcedure
    .input(
      z.object({
        projectReference: z.string(),
      }),
    )
    .query(async ({ input }) => {
      // Get project by reference
      const project = await db.query.projectSchema.findFirst({
        where: eq(projectSchema.reference, input.projectReference),
      });
      if (!project) {
        throw new Error("Project not found");
      }

      const environments = await getEnvironmentsByProject(project.id);

      // Transform to include latest revision variables
      const environmentsWithVariables = environments.map((env) => ({
        id: env.id,
        name: env.name,
        isSystem: env.isSystem,
        isDefault: env.isDefault,
        variables: env.revisions[0]?.variables || {},
      }));

      return { environments: environmentsWithVariables };
    }),

  // Get environment variables by name
  getVariablesByName: protectedProcedure
    .input(
      z.object({
        projectReference: z.string(),
        name: z.string(),
      }),
    )
    .query(async ({ input }) => {
      // Get project by reference
      const project = await db.query.projectSchema.findFirst({
        where: eq(projectSchema.reference, input.projectReference),
      });
      if (!project) {
        throw new Error("Project not found");
      }

      const environment = await getEnvironmentByName(project.id, input.name);
      if (!environment) {
        throw new Error("Environment not found");
      }

      const latestRevision = await getLatestRevision(environment.id);
      const variables =
        (latestRevision?.variables as Record<string, string>) || {};

      return {
        environment: {
          id: environment.id,
          name: environment.name,
          isSystem: environment.isSystem,
          isDefault: environment.isDefault,
        },
        variables,
      };
    }),

  // Set environment variables
  setVariables: protectedProcedure
    .input(
      z.object({
        projectReference: z.string(),
        name: z.string(),
        variables: z.array(
          z.object({
            key: z.string(),
            value: z.string(),
          }),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Get project by reference
      const project = await db.query.projectSchema.findFirst({
        where: eq(projectSchema.reference, input.projectReference),
      });
      if (!project) {
        throw new Error("Project not found");
      }

      const revision = await setEnvironmentVariables(
        project.id,
        input.name,
        input.variables,
        ctx.userId,
      );

      return {
        success: true,
        revision: {
          id: revision.id,
          revisionNumber: revision.revisionNumber,
          variables: revision.variables,
        },
      };
    }),

  // Unset environment variable
  unsetVariable: protectedProcedure
    .input(
      z.object({
        projectReference: z.string(),
        name: z.string(),
        key: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Get project by reference
      const project = await db.query.projectSchema.findFirst({
        where: eq(projectSchema.reference, input.projectReference),
      });
      if (!project) {
        throw new Error("Project not found");
      }

      const revision = await unsetEnvironmentVariable(
        project.id,
        input.name,
        input.key,
        ctx.userId,
      );

      return {
        success: true,
        revision: {
          id: revision.id,
          revisionNumber: revision.revisionNumber,
          variables: revision.variables,
        },
      };
    }),
});
