import { and, desc, eq } from "drizzle-orm";
import { db } from "../libs/db/index.js";
import * as schema from "../libs/db/schema.js";

export async function createEnvironment(
  data: Omit<typeof schema.environmentsSchema.$inferInsert, "id">,
  createdBy?: string,
) {
  const [environment] = await db
    .insert(schema.environmentsSchema)
    .values(data)
    .returning();

  // Create initial revision with empty variables
  const [revision] = await db
    .insert(schema.environmentRevisionsSchema)
    .values({
      environmentId: environment.id,
      revisionNumber: 1,
      variables: {},
      createdBy,
    })
    .returning();

  return { environment, revision };
}

export async function createDefaultEnvironments(projectId: string) {
  // Create production environment
  const prodEnvironment = await createEnvironment({
    projectId,
    name: "production",
    isSystem: true,
    isDefault: false,
  });

  // Create preview environment
  const previewEnvironment = await createEnvironment({
    projectId,
    name: "preview",
    isSystem: true,
    isDefault: true,
  });

  return {
    production: prodEnvironment,
    preview: previewEnvironment,
  };
}

export async function getEnvironmentsByProject(projectId: string) {
  const environments = await db.query.environmentsSchema.findMany({
    where: eq(schema.environmentsSchema.projectId, projectId),
    with: {
      revisions: {
        orderBy: [desc(schema.environmentRevisionsSchema.revisionNumber)],
        limit: 1,
      },
    },
  });

  return environments;
}

export async function getEnvironmentByName(projectId: string, name: string) {
  const environment = await db.query.environmentsSchema.findFirst({
    where: and(
      eq(schema.environmentsSchema.projectId, projectId),
      eq(schema.environmentsSchema.name, name),
    ),
    with: {
      revisions: {
        orderBy: [desc(schema.environmentRevisionsSchema.revisionNumber)],
        limit: 1,
      },
    },
  });

  return environment;
}

export async function getLatestRevision(environmentId: string) {
  const revision = await db.query.environmentRevisionsSchema.findFirst({
    where: eq(schema.environmentRevisionsSchema.environmentId, environmentId),
    orderBy: [desc(schema.environmentRevisionsSchema.revisionNumber)],
  });

  return revision;
}

export async function createEnvironmentRevision(
  environmentId: string,
  variables: Record<string, string>,
  createdBy?: string,
) {
  // Get the latest revision number
  const latestRevision = await getLatestRevision(environmentId);
  const nextRevisionNumber = (latestRevision?.revisionNumber ?? 0) + 1;

  const [revision] = await db
    .insert(schema.environmentRevisionsSchema)
    .values({
      environmentId,
      revisionNumber: nextRevisionNumber,
      variables,
      createdBy,
    })
    .returning();

  return revision;
}

export async function setEnvironmentVariables(
  projectId: string,
  environmentName: string,
  variables: Array<{ key: string; value: string }>,
  userId?: string,
) {
  const environment = await getEnvironmentByName(projectId, environmentName);
  if (!environment) {
    throw new Error(`Environment ${environmentName} not found`);
  }

  // Get current variables
  const currentRevision = await getLatestRevision(environment.id);
  const currentVariables =
    (currentRevision?.variables as Record<string, string>) || {};

  // Update variables
  const updatedVariables = { ...currentVariables };
  for (const { key, value } of variables) {
    updatedVariables[key] = value;
  }

  // Create new revision
  const revision = await createEnvironmentRevision(
    environment.id,
    updatedVariables,
    userId,
  );

  return revision;
}

export async function unsetEnvironmentVariable(
  projectId: string,
  environmentName: string,
  key: string,
  userId?: string,
) {
  const environment = await getEnvironmentByName(projectId, environmentName);
  if (!environment) {
    throw new Error(`Environment ${environmentName} not found`);
  }

  // Get current variables
  const currentRevision = await getLatestRevision(environment.id);
  const currentVariables =
    (currentRevision?.variables as Record<string, string>) || {};

  // Remove the key
  const updatedVariables = { ...currentVariables };
  delete updatedVariables[key];

  // Create new revision
  const revision = await createEnvironmentRevision(
    environment.id,
    updatedVariables,
    userId,
  );

  return revision;
}
