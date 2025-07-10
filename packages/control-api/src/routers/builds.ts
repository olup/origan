import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../instrumentation.js";
import { BuildArtifactFormSchema } from "../schemas/build.js";
import { deployBuild } from "../service/build/deploy.js";

export const buildsRouter = new Hono<Env>().post(
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
      c.var.log.withError(error).error(`Error deploying build ${buildId}`);
      throw new HTTPException(500, {
        message: "Failed to process build artifact",
      });
    }
  },
);
