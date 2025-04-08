import { eq } from "drizzle-orm";
import { db } from "../libs/db/index.js";
import * as schema from "../libs/db/schema.js";

export async function createProject(
  data: typeof schema.projectSchema.$inferInsert,
) {
  const [project] = await db
    .insert(schema.projectSchema)
    .values({
      reference: data.reference,
      name: data.name,
    })
    .returning();

  return project;
}

export async function getProject(id: string) {
  const project = await db.query.projectSchema.findFirst({
    where: eq(schema.projectSchema.id, id),
    with: {
      deployments: true,
    },
  });

  return project;
}

export async function getProjects() {
  const projects = await db.query.projectSchema.findMany({
    with: {
      deployments: true,
    },
  });

  return projects;
}

export async function updateProject(
  id: string,
  data: Partial<typeof schema.projectSchema.$inferInsert>,
) {
  const [project] = await db
    .update(schema.projectSchema)
    .set({
      name: data.name,
    })
    .where(eq(schema.projectSchema.id, id))
    .returning();

  return project;
}

export async function deleteProject(id: string) {
  // The cascade delete will handle removing associated deployments and hosts
  const [project] = await db
    .delete(schema.projectSchema)
    .where(eq(schema.projectSchema.id, id))
    .returning();

  return project;
}
