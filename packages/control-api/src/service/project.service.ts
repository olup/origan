import { type SQLWrapper, and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../libs/db/index.js";
import * as schema from "../libs/db/schema.js";
import { generateReference } from "../utils/reference.js";

export async function createProject(
  data: Omit<typeof schema.projectSchema.$inferInsert, "id" | "reference">,
) {
  const [project] = await db
    .insert(schema.projectSchema)
    .values({
      reference: generateReference(),
      name: data.name,
      userId: data.userId,
    })
    .returning();

  return project;
}

export async function getProject(filter: {
  id?: string;
  reference?: string;
  userId: string;
}) {
  if (filter.id == null && filter.reference == null) {
    throw new Error("Either id or reference must be provided");
  }
  const clauses: SQLWrapper[] = [
    eq(schema.projectSchema.userId, filter.userId),
  ];
  if (filter.id) {
    clauses.push(eq(schema.projectSchema.id, filter.id));
  } else if (filter.reference) {
    clauses.push(eq(schema.projectSchema.reference, filter.reference));
  }

  const project = await db.query.projectSchema.findFirst({
    where: and(...clauses),
    with: {
      deployments: {
        with: {
          hosts: true,
        },
      },
    },
  });

  return project;
}

export async function getProjects(userId: string) {
  const projects = await db.query.projectSchema.findMany({
    where: eq(schema.projectSchema.userId, userId),
    with: {
      deployments: {
        with: {
          hosts: true,
        },
      },
    },
  });

  return projects;
}

export async function updateProject(
  id: string,
  userId: string,
  data: Partial<typeof schema.projectSchema.$inferInsert>,
) {
  const [project] = await db
    .update(schema.projectSchema)
    .set({
      name: data.name,
    })
    .where(
      and(
        eq(schema.projectSchema.id, id),
        eq(schema.projectSchema.userId, userId),
      ),
    )
    .returning();

  return project;
}

export async function deleteProject(id: string, userId: string) {
  // The cascade delete will handle removing associated deployments and hosts
  const [project] = await db
    .delete(schema.projectSchema)
    .where(
      and(
        eq(schema.projectSchema.id, id),
        eq(schema.projectSchema.userId, userId),
      ),
    )
    .returning();

  return project;
}
