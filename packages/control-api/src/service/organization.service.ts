import { and, eq } from "drizzle-orm";
import { db } from "../libs/db/index.js";
import {
  organizationMembershipSchema,
  organizationSchema,
  userSchema,
} from "../libs/db/schema.js";
import { generateReference, REFERENCE_PREFIXES } from "../utils/reference.js";

// Called automatically during user signup
export async function createDefaultOrganization(
  userId: string,
  username: string,
) {
  // Create organization
  const org = await db
    .insert(organizationSchema)
    .values({
      name: `${username}'s Organization`,
      reference: generateReference(10, REFERENCE_PREFIXES.ORGANIZATION),
    })
    .returning();

  // Add user to organization
  await db.insert(organizationMembershipSchema).values({
    userId: userId,
    organizationId: org[0].id,
  });

  return org[0];
}

export async function getUserOrganizations(userId: string) {
  return db
    .select({
      organization: organizationSchema,
    })
    .from(organizationMembershipSchema)
    .innerJoin(
      organizationSchema,
      eq(organizationMembershipSchema.organizationId, organizationSchema.id),
    )
    .where(eq(organizationMembershipSchema.userId, userId));
}

export async function getOrganizationById(id: string) {
  const result = await db
    .select()
    .from(organizationSchema)
    .where(eq(organizationSchema.id, id))
    .limit(1);

  return result[0];
}

export async function getOrganizationByReference(reference: string) {
  const result = await db
    .select()
    .from(organizationSchema)
    .where(eq(organizationSchema.reference, reference))
    .limit(1);

  return result[0];
}

export async function getOrganizationByReferenceWithMembership(
  reference: string,
) {
  return db.query.organizationSchema.findFirst({
    where: eq(organizationSchema.reference, reference),
    with: {
      memberships: {
        with: {
          user: true,
        },
      },
    },
  });
}

export async function getOrganizationMembers(organizationId: string) {
  return db
    .select({
      user: userSchema,
    })
    .from(organizationMembershipSchema)
    .innerJoin(
      userSchema,
      eq(organizationMembershipSchema.userId, userSchema.id),
    )
    .where(eq(organizationMembershipSchema.organizationId, organizationId));
}

export async function isUserMemberOfOrganization(
  userId: string,
  organizationId: string,
) {
  const membership = await db
    .select()
    .from(organizationMembershipSchema)
    .where(
      and(
        eq(organizationMembershipSchema.userId, userId),
        eq(organizationMembershipSchema.organizationId, organizationId),
      ),
    )
    .limit(1);

  return membership.length > 0;
}
