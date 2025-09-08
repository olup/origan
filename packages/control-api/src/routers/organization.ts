import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../instrumentation.js";
import { auth } from "../middleware/auth.js";
import {
  getOrganizationByReference,
  getOrganizationMembers,
  getUserOrganizations,
} from "../service/organization.service.js";

export const organizationRouter = new Hono<Env>()
  // List user's organizations
  .get("/list", auth(), async (c) => {
    try {
      const userId = c.get("userId");
      const userOrgs = await getUserOrganizations(userId);
      const organizations = userOrgs.map((o) => o.organization);
      return c.json(organizations);
    } catch (error) {
      c.var.log.withError(error).error("Error fetching user organizations");
      return c.json(
        {
          error: "Failed to fetch organizations",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  })

  // Get organization by reference
  .get(
    "/getByReference",
    auth(),
    zValidator("query", z.object({ reference: z.string() })),
    async (c) => {
      try {
        const { reference } = c.req.valid("query");
        const userId = c.get("userId");

        const organization = await getOrganizationByReference(reference);
        if (!organization) {
          return c.json({ error: "Organization not found" }, 404);
        }

        // Verify user has access to this organization
        const userOrgs = await getUserOrganizations(userId);
        const hasAccess = userOrgs.some(
          (o) => o.organization.id === organization.id,
        );

        if (!hasAccess) {
          return c.json({ error: "Access denied to organization" }, 403);
        }

        return c.json(organization);
      } catch (error) {
        c.var.log.withError(error).error("Error fetching organization");
        return c.json(
          {
            error: "Failed to fetch organization",
            details: error instanceof Error ? error.message : String(error),
          },
          500,
        );
      }
    },
  )

  // List organization members
  .get(
    "/listMembers",
    auth(),
    zValidator("query", z.object({ organizationReference: z.string() })),
    async (c) => {
      try {
        const { organizationReference } = c.req.valid("query");
        const userId = c.get("userId");

        // Get organization by reference
        const organization = await getOrganizationByReference(
          organizationReference,
        );
        if (!organization) {
          return c.json({ error: "Organization not found" }, 404);
        }

        // TODO: In follow-up PR, verify user has access to this organization
        // For now, we check if user is a member in the endpoint itself
        const userOrgs = await getUserOrganizations(userId);
        const hasAccess = userOrgs.some(
          (o) => o.organization.id === organization.id,
        );

        if (!hasAccess) {
          return c.json({ error: "Access denied to organization" }, 403);
        }

        const members = await getOrganizationMembers(organization.id);
        const users = members.map((m) => m.user);
        return c.json(users);
      } catch (error) {
        c.var.log.withError(error).error("Error fetching organization members");
        return c.json(
          {
            error: "Failed to fetch organization members",
            details: error instanceof Error ? error.message : String(error),
          },
          500,
        );
      }
    },
  );
