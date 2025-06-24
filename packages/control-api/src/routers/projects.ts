import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../instrumentation.js";
import { auth } from "../middleware/auth.js";
import type { ProjectError } from "../schemas/project.js";
import {
  projectCreateSchema,
  projectUpdateSchema,
} from "../schemas/project.js";
import {
  createProject,
  getProject,
  getProjects,
  removeProjectGithubConfig,
  setProjectGithubConfig,
  updateProject,
} from "../service/project.service.js";

export const projectsRouter = new Hono<Env>()
  .get("/", auth(), async (c) => {
    try {
      const userId = c.get("userId");
      const projects = await getProjects(userId);
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
      const project = await createProject({
        ...data,
        userId,
      });
      return c.json(project, 201);
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
      const userId = c.get("userId");

      try {
        const project = await getProject({ reference, userId });
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
        const userId = c.get("userId");
        const project = await updateProject(reference, userId, data);
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
        // TODO: this parameter will stay unused until we implement
        // relations between projects and branches
        productionBranch: z.string(),
      }),
    ),
    async (c) => {
      const { reference } = c.req.valid("param");
      const githubData = c.req.valid("json");
      const userId = c.get("userId");

      try {
        const githubConfig = await setProjectGithubConfig(
          reference,
          userId,
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
      const userId = c.get("userId");

      try {
        await removeProjectGithubConfig(reference, userId);
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
