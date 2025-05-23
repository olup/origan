import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { auth } from "../middleware/auth.js";
import { BuildArtifactFormSchema } from "../schemas/build.js";
import { deployBuild } from "../service/build/deploy.js";
import {
  getBuildByReference,
  getProjectBuilds,
} from "../service/build/index.js";

export const buildsRouter = new Hono()
  .post(
    "/:buildId/deploy",
    zValidator("form", BuildArtifactFormSchema),
    async (c) => {
      const token = c.req.header("Authorization")?.replace("Bearer ", "");
      if (!token) {
        throw new HTTPException(401, { message: "Missing deploy token" });
      }

      const buildId = c.req.param("buildId");
      const { artifact, config } = c.req.valid("form");

      try {
        await deployBuild(buildId, artifact, config, token);
        return c.json({ success: true });
      } catch (error) {
        console.error(`Error deploying build ${buildId}:`, error);
        throw new HTTPException(500, {
          message: "Failed to process build artifact",
        });
      }
    },
  )
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
        if (build.project?.userId !== userId) {
          throw new HTTPException(403, {
            message: "You do not have permission to access this build.",
          });
        }

        return c.json({
          id: build.id,
          status: build.status,
          createdAt: build.createdAt,
          updatedAt: build.updatedAt,
          buildStartedAt: build.buildStartedAt,
          buildEndedAt: build.buildEndedAt,
          logs: build.logs,
          branch: build.branch,
          commitSha: build.commitSha,
          reference: build.reference,
          project: {
            reference: build.project.reference,
          },
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
        return c.json(
          builds.map((build) => ({
            id: build.id,
            status: build.status,
            createdAt: build.createdAt,
            updatedAt: build.updatedAt,
            buildStartedAt: build.buildStartedAt,
            buildEndedAt: build.buildEndedAt,
            branch: build.branch,
            commitSha: build.commitSha,
            reference: build.reference,
            buildUrl: build.buildUrl,
          })),
        );
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
