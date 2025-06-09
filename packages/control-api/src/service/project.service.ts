import { type SQLWrapper, and, eq } from "drizzle-orm";
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
      githubConfig: true,
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
      githubConfig: true,
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

// GitHub Config Management

// Create or update GitHub config for a project
export async function setProjectGithubConfig(
  reference: string,
  userId: string,
  githubData: Omit<typeof schema.githubConfigSchema.$inferInsert, "projectId">,
) {
  // Verify project exists and belongs to user
  const project = await getProject({ reference: reference, userId });
  if (project == null) {
    throw new Error(
      `Project not found with reference: ${reference} (userId: ${userId})`,
    );
  }

  // Use upsert operation instead of separate query and update/insert
  const [githubConfig] = await db
    .insert(schema.githubConfigSchema)
    .values({
      projectId: project.id,
      githubRepositoryId: githubData.githubRepositoryId,
      githubRepositoryFullName: githubData.githubRepositoryFullName,
    })
    .onConflictDoUpdate({
      target: schema.githubConfigSchema.projectId,
      set: {
        githubRepositoryId: githubData.githubRepositoryId,
        githubRepositoryFullName: githubData.githubRepositoryFullName,
      },
    })
    .returning();

  return githubConfig;
}

// Remove GitHub config for a project
export async function removeProjectGithubConfig(
  projectId: string,
  userId: string,
): Promise<void> {
  // Verify project exists and belongs to user
  const project = await getProject({ id: projectId, userId });
  if (!project) {
    throw new Error(`Project not found with ID: ${projectId}`);
  }

  // Delete the GitHub config
  await db
    .delete(schema.githubConfigSchema)
    .where(eq(schema.githubConfigSchema.projectId, projectId));
}

// Get GitHub config for a project
export async function getProjectGithubConfig(
  projectId: string,
  userId: string,
) {
  // Verify project exists and belongs to user
  const project = await getProject({ id: projectId, userId });
  if (!project) {
    throw new Error(`Project not found with ID: ${projectId}`);
  }

  const githubConfig = await db.query.githubConfigSchema.findFirst({
    where: eq(schema.githubConfigSchema.projectId, projectId),
  });

  return githubConfig;
}
