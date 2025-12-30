import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../libs/db/index.js";
import {
  organizationMembershipSchema,
  organizationSchema,
} from "../../libs/db/schema.js";
import { getOrgWithAccessCheck } from "../../service/authorization.service.js";
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
    .query(async ({ input, ctx }) => {
      const org = await getOrgWithAccessCheck(ctx.userId, input.reference);
      return org;
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
