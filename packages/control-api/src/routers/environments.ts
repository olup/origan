import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../instrumentation.js";
import { db } from "../libs/db/index.js";
import { projectSchema } from "../libs/db/schema.js";
import { auth } from "../middleware/auth.js";
import {
  getEnvironmentByName,
  getEnvironmentsByProject,
  getLatestRevision,
  setEnvironmentVariables,
  unsetEnvironmentVariable,
} from "../service/environment.service.js";

const listByProjectReferenceSchema = z.object({
  projectReference: z.string(),
});

const getVariablesByNameSchema = z.object({
  projectReference: z.string(),
  name: z.string(),
});

const setVariablesSchema = z.object({
  projectReference: z.string(),
  name: z.string(),
  variables: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
    }),
  ),
});

const unsetVariableSchema = z.object({
  projectReference: z.string(),
  name: z.string(),
  key: z.string(),
});

export const environmentsRouter = new Hono<Env>()
  // List environments by project
  .post(
    "/listByProjectReference",
    auth(),
    zValidator("json", listByProjectReferenceSchema),
    async (c) => {
      try {
        const { projectReference } = c.req.valid("json");

        // Get project by reference
        const project = await db.query.projectSchema.findFirst({
          where: eq(projectSchema.reference, projectReference),
        });
        if (!project) {
          return c.json({ error: "Project not found" }, 404);
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

        return c.json({ environments: environmentsWithVariables });
      } catch (error) {
        return c.json(
          {
            error: "Failed to list environments",
            details: error instanceof Error ? error.message : String(error),
          },
          500,
        );
      }
    },
  )
  // Get environment variables by name
  .post(
    "/getVariablesByName",
    auth(),
    zValidator("json", getVariablesByNameSchema),
    async (c) => {
      try {
        const { projectReference, name } = c.req.valid("json");

        // Get project by reference
        const project = await db.query.projectSchema.findFirst({
          where: eq(projectSchema.reference, projectReference),
        });
        if (!project) {
          return c.json({ error: "Project not found" }, 404);
        }

        const environment = await getEnvironmentByName(project.id, name);
        if (!environment) {
          return c.json({ error: "Environment not found" }, 404);
        }

        const latestRevision = await getLatestRevision(environment.id);
        const variables =
          (latestRevision?.variables as Record<string, string>) || {};

        return c.json({
          environment: {
            id: environment.id,
            name: environment.name,
            isSystem: environment.isSystem,
            isDefault: environment.isDefault,
          },
          variables,
        });
      } catch (error) {
        return c.json(
          {
            error: "Failed to get environment variables",
            details: error instanceof Error ? error.message : String(error),
          },
          500,
        );
      }
    },
  )
  // Set environment variables
  .post(
    "/setVariables",
    auth(),
    zValidator("json", setVariablesSchema),
    async (c) => {
      try {
        const { projectReference, name, variables } = c.req.valid("json");
        const userId = c.get("userId");

        // Get project by reference
        const project = await db.query.projectSchema.findFirst({
          where: eq(projectSchema.reference, projectReference),
        });
        if (!project) {
          return c.json({ error: "Project not found" }, 404);
        }

        const revision = await setEnvironmentVariables(
          project.id,
          name,
          variables,
          userId,
        );

        return c.json({
          success: true,
          revision: {
            id: revision.id,
            revisionNumber: revision.revisionNumber,
            variables: revision.variables,
          },
        });
      } catch (error) {
        return c.json(
          {
            error: "Failed to set environment variables",
            details: error instanceof Error ? error.message : String(error),
          },
          500,
        );
      }
    },
  )
  // Unset environment variable
  .post(
    "/unsetVariable",
    auth(),
    zValidator("json", unsetVariableSchema),
    async (c) => {
      try {
        const { projectReference, name, key } = c.req.valid("json");
        const userId = c.get("userId");

        // Get project by reference
        const project = await db.query.projectSchema.findFirst({
          where: eq(projectSchema.reference, projectReference),
        });
        if (!project) {
          return c.json({ error: "Project not found" }, 404);
        }

        const revision = await unsetEnvironmentVariable(
          project.id,
          name,
          key,
          userId,
        );

        return c.json({
          success: true,
          revision: {
            id: revision.id,
            revisionNumber: revision.revisionNumber,
            variables: revision.variables,
          },
        });
      } catch (error) {
        return c.json(
          {
            error: "Failed to unset environment variable",
            details: error instanceof Error ? error.message : String(error),
          },
          500,
        );
      }
    },
  );
