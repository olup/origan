import { z } from "zod";
import { getLogger } from "../../instrumentation.js";
import {
  addCustomDomain,
  getCustomDomainsForProject,
  getDomainStatus,
  removeCustomDomain,
} from "../../service/domain.service.js";
import { protectedProcedure, router } from "../init.js";

const log = getLogger();

export const domainsRouter = router({
  // Add a custom domain to a track
  // Will throw an error if DNS validation fails
  addCustomDomain: protectedProcedure
    .input(
      z.object({
        projectReference: z.string().min(1),
        trackName: z.string().min(1),
        domain: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      log.info(
        `Adding custom domain: ${input.domain} to project: ${input.projectReference}, track: ${input.trackName}`,
      );

      try {
        const result = await addCustomDomain({
          projectReference: input.projectReference,
          trackName: input.trackName,
          domainName: input.domain,
        });

        return result;
      } catch (error) {
        log.withError(error).error("Failed to add custom domain");
        throw error;
      }
    }),

  // Remove a custom domain
  removeCustomDomain: protectedProcedure
    .input(
      z.object({
        domain: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      log.info(`Removing custom domain: ${input.domain}`);

      try {
        await removeCustomDomain(input.domain);
        return { success: true };
      } catch (error) {
        log.withError(error).error("Failed to remove custom domain");
        throw error;
      }
    }),

  // List custom domains for a project
  listCustomDomains: protectedProcedure
    .input(
      z.object({
        projectReference: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      log.info(`Listing custom domains for project: ${input.projectReference}`);

      try {
        const domains = await getCustomDomainsForProject(
          input.projectReference,
        );
        return domains;
      } catch (error) {
        log.withError(error).error("Failed to list custom domains");
        throw error;
      }
    }),

  // Get domain status (certificate status, expiry, errors)
  getDomainStatus: protectedProcedure
    .input(
      z.object({
        domain: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      log.info(`Getting domain status: ${input.domain}`);

      try {
        const status = await getDomainStatus(input.domain);
        return status;
      } catch (error) {
        log.withError(error).error("Failed to get domain status");
        throw error;
      }
    }),
});
