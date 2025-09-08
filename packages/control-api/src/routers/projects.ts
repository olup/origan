import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../instrumentation.js";
import { db } from "../libs/db/index.js";
import { organizationSchema, projectSchema } from "../libs/db/schema.js";
import { auth } from "../middleware/auth.js";
import type { ProjectError } from "../schemas/project.js";
import {
  projectCreateSchema,
  projectUpdateSchema,
} from "../schemas/project.js";
import {
  createProjectWithProdTrack,
  getProjects,
  removeProjectGithubConfig,
  setProjectGithubConfig,
  updateProject,
} from "../service/project.service.js";

export const projectsRouter = new Hono<Env>()
  // Get projects for a specific organization
  .get("/", auth(), async (c) => {
    try {
      const organizationReference = c.req.query("organizationReference");
      if (!organizationReference) {
        return c.json({ error: "organizationReference is required" }, 400);
      }

      // Get organization by reference
      const organization = await db.query.organizationSchema.findFirst({
        where: eq(organizationSchema.reference, organizationReference),
      });

      if (!organization) {
        return c.json({ error: "Organization not found" }, 404);
      }

      // TODO: Add organization membership check in service layer
      const projects = await getProjects(organization.id);
      return c.json(projects);
    } catch (error) {
      const errorResponse: ProjectError = {
        error: "Failed to fetch projects",
        details: error instanceof Error ? error.message : String(error),
      };
      return c.json(errorResponse, 500);
    }
  })

  .post("/", auth(), zValidator("json", projectCreateSchema), async (c) => {
    const data = c.req.valid("json");

    try {
      const userId = c.get("userId");
      // TODO: verify user membership

      const organization = await db.query.organizationSchema.findFirst({
        where: eq(organizationSchema.reference, data.organizationReference),
      });

      if (!organization) {
        return c.json({ error: "Organization not found" }, 404);
      }

      const result = await createProjectWithProdTrack({
        ...data,
        organizationId: organization.id,
        creatorId: userId,
      });
      return c.json(result.project, 201);
    } catch (error) {
      c.var.log.withError(error).error("Error creating project");
      const errorResponse = {
        error: "Failed to create project",
        details: error instanceof Error ? error.message : String(error),
      };
      return c.json(errorResponse, 500);
    }
  })
  .get(
    "/:reference",
    auth(),
    zValidator("param", z.object({ reference: z.string().min(1) })),
    async (c) => {
      const { reference } = c.req.valid("param");

      try {
        // TODO: In follow-up PR, verify user has access to the project's organization
        const project = await db.query.projectSchema.findFirst({
          where: eq(projectSchema.reference, reference),
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
          const errorResponse: ProjectError = {
            error: "Project not found",
            details: `No project found with reference ${reference}`,
          };
          return c.json(errorResponse, 404);
        }

        return c.json(project);
      } catch (error) {
        const errorResponse: ProjectError = {
          error: "Failed to fetch project",
          details: error instanceof Error ? error.message : String(error),
        };
        return c.json(errorResponse, 500);
      }
    },
  )
  .put(
    "/:reference",
    auth(),
    zValidator("param", z.object({ reference: z.string().min(1) })),
    zValidator("json", projectUpdateSchema),
    async (c) => {
      const { reference } = c.req.valid("param");
      const data = c.req.valid("json");

      try {
        // TODO: In follow-up PR, verify user has access to the project's organization
        const existingProject = await db.query.projectSchema.findFirst({
          where: eq(projectSchema.reference, reference),
        });

        if (!existingProject) {
          const errorResponse: ProjectError = {
            error: "Project not found",
            details: `No project found with reference ${reference}`,
          };
          return c.json(errorResponse, 404);
        }

        const project = await updateProject(
          existingProject.id,
          existingProject.organizationId,
          data,
        );
        return c.json(project);
      } catch (error) {
        const errorResponse: ProjectError = {
          error: "Failed to update project",
          details: error instanceof Error ? error.message : String(error),
        };
        return c.json(errorResponse, 500);
      }
    },
  )
  .delete(
    "/:reference",
    auth(),
    zValidator("param", z.object({ reference: z.string().min(1) })),
    async (_c) => {
      // TODO - Implementation pending
      // Delete each remaining deployment (which involves cleaning the directory in s3)
      // Delete any remaining domain object (which involves cleaning any certificates we might have)
    },
  )
  // GitHub Configuration Endpoints
  .post(
    "/:reference/github/config",
    auth(),
    zValidator("param", z.object({ reference: z.string().min(1) })),
    zValidator(
      "json",
      z.object({
        githubRepositoryId: z.number(),
        githubRepositoryFullName: z.string(),
        productionBranchName: z.string(),
        projectRootPath: z.string().optional(),
      }),
    ),
    async (c) => {
      const { reference } = c.req.valid("param");
      const githubData = c.req.valid("json");
      const userId = c.get("userId");

      try {
        // TODO: In follow-up PR, verify user has access to the project's organization
        const project = await db.query.projectSchema.findFirst({
          where: eq(projectSchema.reference, reference),
        });

        if (!project) {
          return c.json({ error: "Project not found" }, 404);
        }

        const githubConfig = await setProjectGithubConfig(
          reference,
          project.organizationId,
          userId, // Still need userId for GitHub installation lookup
          githubData,
        );
        return c.json(githubConfig, 201);
      } catch (error) {
        const errorResponse = {
          error: "Failed to set GitHub configuration",
          details: error instanceof Error ? error.message : String(error),
        };
        return c.json(errorResponse, 500);
      }
    },
  )
  .delete(
    "/:reference/github/config",
    auth(),
    zValidator("param", z.object({ reference: z.string().min(1) })),
    async (c) => {
      const { reference } = c.req.valid("param");

      try {
        // TODO: In follow-up PR, verify user has access to the project's organization
        const project = await db.query.projectSchema.findFirst({
          where: eq(projectSchema.reference, reference),
        });

        if (!project) {
          const errorResponse: ProjectError = {
            error: "Project not found",
            details: `No project found with reference ${reference}`,
          };
          return c.json(errorResponse, 404);
        }

        await removeProjectGithubConfig(project.id, project.organizationId);
        return c.json({ success: true });
      } catch (error) {
        const errorResponse = {
          error: "Failed to remove GitHub configuration",
          details: error instanceof Error ? error.message : String(error),
        };
        return c.json(errorResponse, 500);
      }
    },
  );
