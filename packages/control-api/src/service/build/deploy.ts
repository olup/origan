import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../../libs/db/index.js";
import { buildSchema } from "../../libs/db/schema.js";
import { verifyToken } from "../../utils/token.js";
import { deploy } from "../deployment.service.js";

export async function deployBuild(
  buildId: string,
  artifact: File,
  config: {
    app: string[];
    api: {
      urlPath: string;
      functionPath: string;
    }[];
  },
  token: string,
) {
  const build = await db.query.buildSchema.findFirst({
    where: eq(buildSchema.id, buildId),
    with: {
      project: true,
    },
  });

  if (!build) {
    throw new HTTPException(404, { message: `Build ${buildId} not found` });
  }

  if (!build.project) {
    throw new HTTPException(404, {
      message: `Project not found for build ${buildId}`,
    });
  }

  // Verify deploy token
  if (!build.deployToken) {
    throw new HTTPException(401, { message: "Build token not found" });
  }

  try {
    if (!verifyToken(token, build.deployToken)) {
      throw new HTTPException(401, { message: "Invalid deploy token" });
    }
  } catch {
    throw new HTTPException(401, { message: "Invalid deploy token" });
  }

  // Remove the token after successful verification
  await db
    .update(buildSchema)
    .set({ deployToken: null })
    .where(eq(buildSchema.id, buildId));

  const deployResult = await deploy({
    projectRef: build.project.reference,
    branchRef: build.branch,
    bundle: artifact,
    config,
    track: build.branch, // deploy to a track with the branch name
  });

  await db
    .update(buildSchema)
    .set({ deploymentId: deployResult.deploymentId })
    .where(eq(buildSchema.id, buildId));

  return deployResult;
}
