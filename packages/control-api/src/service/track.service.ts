import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../libs/db/index.js";
import {
  deploymentSchema,
  domainSchema,
  projectSchema,
  trackSchema,
} from "../libs/db/schema.js";

/**
 * Create a new track and its default domain.
 */
export async function createTrack({
  projectId,
  name,
  isSystem = false,
}: {
  projectId: string;
  name: string;
  isSystem: boolean;
}) {
  return await db.transaction(async (tx) => {
    // Create the track
    const [track] = await tx
      .insert(trackSchema)
      .values({ projectId, name, isSystem })
      .returning();

    // Get project reference for domain name
    const project = await tx.query.projectSchema.findFirst({
      where: eq(projectSchema.id, projectId),
    });
    if (!project) throw new Error("Project not found");

    const domainName = `${name}--${project.reference}.`;

    // Direct ORM call: should belong to the domain service
    await tx.insert(domainSchema).values({
      name: domainName,
      projectId,
      trackId: track.id,
    });

    return track;
  });
}

/**
 * Delete a track by ID.
 */
export async function deleteTrack(trackId: string) {
  // Direct ORM call: should belong to the domain service
  // CAUTION: this works for internal domain, will need to be adapted for external domains
  await db.delete(domainSchema).where(eq(domainSchema.trackId, trackId));
  await db.delete(trackSchema).where(eq(trackSchema.id, trackId));
}

/**
 * Update all domains for a track to point to the latest deployment.
 */
export async function updateTrackDomains(trackId: string) {
  return await db.transaction(async (tx) => {
    // Direct ORM call: should belong to the domain service
    const domains = await tx.query.domainSchema.findMany({
      where: eq(domainSchema.trackId, trackId),
    });

    // Direct ORM call: should belong to the deployment service
    const latestDeployment = await tx.query.deploymentSchema.findFirst({
      where: eq(deploymentSchema.trackId, trackId),
      orderBy: desc(deploymentSchema.createdAt),
    });

    if (!latestDeployment) return;

    // Direct ORM call: should belong to the domain service

    await tx
      .update(domainSchema)
      .set({ deploymentId: latestDeployment.id })
      .where(
        inArray(
          domainSchema.id,
          domains.map((d) => d.id),
        ),
      );
  });
}

/**
 * Get or create a track by name and projectId.
 */
export async function getOrCreateTrack({
  projectId,
  name,
  isSystem,
}: {
  projectId: string;
  name: string;
  isSystem: boolean;
}) {
  let track = await db.query.trackSchema.findFirst({
    where: and(
      eq(trackSchema.projectId, projectId),
      eq(trackSchema.name, name),
    ),
  });
  if (!track) {
    track = await createTrack({ projectId, name, isSystem });
  }
  return track;
}
