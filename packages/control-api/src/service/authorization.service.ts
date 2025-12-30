import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { db } from "../libs/db/index.js";
import {
  organizationMembershipSchema,
  organizationSchema,
  projectSchema,
} from "../libs/db/schema.js";

/**
 * Asserts that a user is a member of an organization.
 * Throws FORBIDDEN if not a member, NOT_FOUND if org doesn't exist.
 */
export async function assertOrgMembership(
  userId: string,
  organizationId: string,
): Promise<void> {
  const membership = await db.query.organizationMembershipSchema.findFirst({
    where: and(
      eq(organizationMembershipSchema.userId, userId),
      eq(organizationMembershipSchema.organizationId, organizationId),
    ),
  });

  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this organization",
    });
  }
}

/**
 * Asserts that a user has access to a project via org membership.
 * Throws FORBIDDEN if not a member, NOT_FOUND if project doesn't exist.
 */
export async function assertProjectAccess(
  userId: string,
  projectId: string,
): Promise<void> {
  const project = await db.query.projectSchema.findFirst({
    where: eq(projectSchema.id, projectId),
  });

  if (!project) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Project not found",
    });
  }

  await assertOrgMembership(userId, project.organizationId);
}

/**
 * Gets an organization by reference with membership check.
 * Returns the organization if user has access, throws otherwise.
 */
export async function getOrgWithAccessCheck(
  userId: string,
  orgReference: string,
): Promise<{ id: string; reference: string; name: string }> {
  const org = await db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.reference, orgReference),
  });

  if (!org) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Organization not found",
    });
  }

  await assertOrgMembership(userId, org.id);

  return org;
}

/**
 * Gets a project by reference with access check.
 * Returns the project if user has access via org membership.
 */
export async function getProjectWithAccessCheck(
  userId: string,
  projectReference: string,
): Promise<typeof projectSchema.$inferSelect> {
  const project = await db.query.projectSchema.findFirst({
    where: eq(projectSchema.reference, projectReference),
  });

  if (!project) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Project not found",
    });
  }

  await assertOrgMembership(userId, project.organizationId);

  return project;
}
