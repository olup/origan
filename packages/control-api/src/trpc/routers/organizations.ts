import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../libs/db/index.js";
import {
  organizationMembershipSchema,
  organizationSchema,
} from "../../libs/db/schema.js";
import { protectedProcedure, router } from "../init.js";

export const organizationsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userOrgs = await db
      .select({
        id: organizationSchema.id,
        reference: organizationSchema.reference,
        name: organizationSchema.name,
      })
      .from(organizationMembershipSchema)
      .innerJoin(
        organizationSchema,
        eq(organizationMembershipSchema.organizationId, organizationSchema.id),
      )
      .where(eq(organizationMembershipSchema.userId, ctx.userId));

    return userOrgs;
  }),

  get: protectedProcedure
    .input(
      z.object({
        reference: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const result = await db
        .select()
        .from(organizationSchema)
        .innerJoin(
          organizationMembershipSchema,
          eq(
            organizationSchema.id,
            organizationMembershipSchema.organizationId,
          ),
        )
        .where(eq(organizationSchema.reference, input.reference))
        .limit(1);

      const organization = result[0];

      if (!organization) {
        throw new Error("Organization not found");
      }

      return organization.organization;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const reference = `org_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

      const [organization] = await db
        .insert(organizationSchema)
        .values({
          name: input.name,
          reference,
        })
        .returning();

      // Add user to organization
      await db.insert(organizationMembershipSchema).values({
        userId: ctx.userId,
        organizationId: organization.id,
      });

      return organization;
    }),
});
