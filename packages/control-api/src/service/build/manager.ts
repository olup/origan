import { eq } from "drizzle-orm";
import { db } from "../../libs/db/index.js";
import { buildSchema } from "../../libs/db/schema.js";

export async function getBuildById(buildId: string) {
  try {
    const build = await db.query.buildSchema.findFirst({
      where: eq(buildSchema.id, buildId),
      with: {
        project: {
          with: {
            user: true,
          },
        },
      },
    });

    return build;
  } catch (error) {
    console.error(`Error fetching build ${buildId}:`, error);
    throw error;
  }
}
