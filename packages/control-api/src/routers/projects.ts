import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import {
  projectCreateSchema,
  projectUpdateSchema,
} from "../schemas/project.js";
import type { ProjectError } from "../schemas/project.js";
import {
  createProject,
  getProject,
  getProjects,
  updateProject,
} from "../service/project.service.js";

// Projects router
export const projectsRouter = new Hono()
  .get("/", async (c) => {
    try {
      const projects = await getProjects();
      return c.json(projects);
    } catch (error) {
      const errorResponse: ProjectError = {
        error: "Failed to fetch projects",
        details: error instanceof Error ? error.message : String(error),
      };
      return c.json(errorResponse, 500);
    }
  })
  .get("/:id", zValidator("param", z.object({ id: z.string() })), async (c) => {
    const { id } = c.req.valid("param");

    try {
      const project = await getProject(id);
      if (!project) {
        const errorResponse: ProjectError = {
          error: "Project not found",
          details: `No project found with ID ${id}`,
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
  })
  .post("/", zValidator("json", projectCreateSchema), async (c) => {
    const data = await c.req.valid("json");

    try {
      const randomRef = customAlphabet(
        "abcdefghijklmnopqrstuvwxyz0123456789_-",
      )(12);
      const project = await createProject({
        ...data,
        reference: randomRef,
      });
      return c.json(project, 201);
    } catch (error) {
      console.error("Error creating project:", error);
      const errorResponse = {
        error: "Failed to create project",
        details: error instanceof Error ? error.message : String(error),
      };
      return c.json(errorResponse, 500);
    }
  })
  .put(
    "/:id",
    zValidator("param", z.object({ id: z.string() })),
    zValidator("json", projectUpdateSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const data = await c.req.valid("json");

      try {
        const project = await updateProject(id, data);
        if (!project) {
          const errorResponse: ProjectError = {
            error: "Project not found",
            details: `No project found with ID ${id}`,
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
    "/:id",
    zValidator("param", z.object({ id: z.string() })),
    async (c) => {
      const { id } = c.req.valid("param");
      // TODO
      // Delete each remaining deployment (which involves cleaning the directory in s3)
      // WDelete any remaining host object (which involves cleaning any certificates we might have)
    },
  );
