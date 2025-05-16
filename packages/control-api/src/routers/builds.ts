import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { auth } from "../middleware/auth.js";
import {
  getBuildByReference,
  getProjectBuilds,
} from "../service/build/index.js";

export const buildsRouter = new Hono()
  .get(
    "/:reference",
    auth(),
    zValidator(
      "param",
      z.object({
        reference: z.string().min(1),
      }),
    ),
    async (c) => {
      const { reference } = c.req.valid("param");
      const userId = c.get("userId");

      try {
        const build = await getBuildByReference(reference);

        if (!build) {
          throw new HTTPException(404, {
            message: `Build ${reference} not found.`,
          });
        }

        // Check if the user has access to the build
        if (build.project.userId !== userId) {
          throw new HTTPException(403, {
            message: "You do not have permission to access this build.",
          });
        }

        return c.json({
          id: build.id,
          status: build.status,
          createdAt: build.createdAt,
          updatedAt: build.updatedAt,
          logs: build.logs,
          branch: build.branch,
          commitSha: build.commitSha,
          reference: build.reference,
        });
      } catch (error) {
        console.error(`Error fetching build ${reference}:`, error);
        if (error instanceof HTTPException) throw error;
        throw new HTTPException(500, {
          message: "Failed to retrieve build.",
        });
      }
    },
  )
  .get(
    "/by-project/:projectReference",
    auth(),
    zValidator(
      "param",
      z.object({
        projectReference: z.string().min(1),
      }),
    ),
    async (c) => {
      const { projectReference } = c.req.valid("param");
      const userId = c.get("userId");

      try {
        const builds = await getProjectBuilds(projectReference, userId);
        return c.json(builds);
      } catch (error) {
        console.error(
          `Error fetching builds for project ${projectReference}:`,
          error,
        );
        throw new HTTPException(500, {
          message: "Failed to retrieve builds.",
        });
      }
    },
  );
