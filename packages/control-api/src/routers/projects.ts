import { Hono } from "hono";
import { customAlphabet } from "nanoid";
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
  .get("/:id", async (c) => {
    const { id } = c.req.param();
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
  .post("/", async (c) => {
    const body = await c.req.json();
    const result = projectCreateSchema.safeParse(body);

    if (!result.success) {
      const errorResponse: ProjectError = {
        error: "Invalid request format",
        details: result.error.message,
      };
      return c.json(errorResponse, 400);
    }

    try {
      const randomRef = customAlphabet(
        "abcdefghijklmnopqrstuvwxyz0123456789_-",
      )(12);
      const project = await createProject({
        ...result.data,
        reference: randomRef,
      });
      return c.json(project, 201);
    } catch (error) {
      const errorResponse: ProjectError = {
        error: "Failed to create project",
        details: error instanceof Error ? error.message : String(error),
      };
      return c.json(errorResponse, 500);
    }
  })
  .put("/:id", async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();
    const result = projectUpdateSchema.safeParse(body);

    if (!result.success) {
      const errorResponse: ProjectError = {
        error: "Invalid request format",
        details: result.error.message,
      };
      return c.json(errorResponse, 400);
    }

    try {
      const project = await updateProject(id, result.data);
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
  })
  .delete("/:id", async (c) => {
    const { id } = c.req.param();
    // TODO
    // Delete each remaining deployment (which involves cleaning the directory in s3)
    // WDelete any remaining host object (which involves cleaning any certificates we might have)
  });
