import { and, eq, type SQLWrapper } from "drizzle-orm";
import { db } from "../libs/db/index.js";
import * as schema from "../libs/db/schema.js";
import { generateReference } from "../utils/reference.js";
import { createTrack } from "./track.service.js";

export async function createProject(
  data: Omit<typeof schema.projectSchema.$inferInsert, "id" | "reference">,
) {
  const [project] = await db
    .insert(schema.projectSchema)
    .values({
      reference: generateReference(),
      name: data.name,
      organizationId: data.organizationId,
      creatorId: data.creatorId,
    })
    .returning();

  return project;
}

export async function createProjectWithProdTrack(
  data: Omit<typeof schema.projectSchema.$inferInsert, "id" | "reference">,
) {
  // create the project
  const project = await createProject(data);

  // create the prod track
  const track = await createTrack({
    projectId: project.id,
    name: "prod",
    isSystem: true,
  });

  // Associate the default domain to the prod track
  // TODO move to domains service
  const [prodDomain] = await db
    .insert(schema.domainSchema)
    .values({
      name: `${project.reference}.origan.app`,
      projectId: project.id,
      trackId: track.id,
    })
    .returning();

  return {
    project,
    track,
    domain: prodDomain,
  };
}

export async function getProject(filter: {
  id?: string;
  reference?: string;
  organizationId: string;
}) {
  if (filter.id == null && filter.reference == null) {
    throw new Error("Either id or reference must be provided");
  }
  const clauses: SQLWrapper[] = [
    eq(schema.projectSchema.organizationId, filter.organizationId),
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
          domains: true,
        },
      },
      githubConfig: true,
    },
  });

  return project;
}

export async function getProjects(organizationId: string) {
  const projects = await db.query.projectSchema.findMany({
    where: eq(schema.projectSchema.organizationId, organizationId),
    with: {
      deployments: {
        with: {
          domains: true,
        },
      },
      githubConfig: true,
    },
  });

  return projects;
}

export async function updateProject(
  id: string,
  organizationId: string,
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
        eq(schema.projectSchema.organizationId, organizationId),
      ),
    )
    .returning();

  return project;
}

export async function deleteProject(id: string, organizationId: string) {
  // The cascade delete will handle removing associated deployments and domains
  const [project] = await db
    .delete(schema.projectSchema)
    .where(
      and(
        eq(schema.projectSchema.id, id),
        eq(schema.projectSchema.organizationId, organizationId),
      ),
    )
    .returning();

  return project;
}

// GitHub Config Management

// Create or update GitHub config for a project
export async function setProjectGithubConfig(
  reference: string,
  organizationId: string,
  userId: string, // Still need userId for GitHub installation lookup
  githubData: Omit<
    typeof schema.githubConfigSchema.$inferInsert,
    "projectId" | "githubAppInstallationId"
  >,
) {
  // Verify project exists and belongs to organization
  const project = await getProject({ reference: reference, organizationId });
  if (project == null) {
    throw new Error(
      `Project not found with reference: ${reference} (organizationId: ${organizationId})`,
    );
  }

  // Find the user's GitHub app installation
  const installation = await db.query.githubAppInstallationSchema.findFirst({
    where: eq(schema.githubAppInstallationSchema.userId, userId),
  });

  if (!installation) {
    throw new Error(
      `No GitHub App installation found for user ID: ${userId}. Please install the GitHub App first.`,
    );
  }

  // Use upsert operation instead of separate query and update/insert
  const [githubConfig] = await db
    .insert(schema.githubConfigSchema)
    .values({
      projectId: project.id,
      githubRepositoryId: githubData.githubRepositoryId,
      githubRepositoryFullName: githubData.githubRepositoryFullName,
      githubAppInstallationId: installation.id,
      productionBranchName: githubData.productionBranchName,
      projectRootPath: githubData.projectRootPath,
    })
    .onConflictDoUpdate({
      target: schema.githubConfigSchema.projectId,
      set: {
        githubRepositoryId: githubData.githubRepositoryId,
        githubRepositoryFullName: githubData.githubRepositoryFullName,
        githubAppInstallationId: installation.id,
        productionBranchName: githubData.productionBranchName,
        projectRootPath: githubData.projectRootPath,
      },
    })
    .returning();

  return githubConfig;
}

// Remove GitHub config for a project
export async function removeProjectGithubConfig(
  projectId: string,
  organizationId: string,
): Promise<void> {
  // Verify project exists and belongs to organization
  const project = await getProject({ id: projectId, organizationId });
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
  organizationId: string,
) {
  // Verify project exists and belongs to organization
  const project = await getProject({ id: projectId, organizationId });
  if (!project) {
    throw new Error(`Project not found with ID: ${projectId}`);
  }

  const githubConfig = await db.query.githubConfigSchema.findFirst({
    where: eq(schema.githubConfigSchema.projectId, projectId),
  });

  return githubConfig;
}
