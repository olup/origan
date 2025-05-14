import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { auth } from "../middleware/auth.js";
import { getBuildById } from "../service/build/index.js";

export const buildsRouter = new Hono();

// Get a single build by ID
buildsRouter.get(
  "/:buildId",
  auth(),
  zValidator(
    "param",
    z.object({
      buildId: z.string().uuid(),
    }),
  ),
  async (c) => {
    const { buildId } = c.req.valid("param");
    const userId = c.get("userId");

    try {
      const build = await getBuildById(buildId);

      if (!build) {
        throw new HTTPException(404, {
          message: `Build ${buildId} not found.`,
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
      console.error(`Error fetching build ${buildId}:`, error);
      if (error instanceof HTTPException) throw error;
      throw new HTTPException(500, {
        message: "Failed to retrieve build.",
      });
    }
  },
);
