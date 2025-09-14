import type { AppRouter } from "@origan/control-api/src/trpc/router";
import type { inferRouterOutputs } from "@trpc/server";
import { Command, Option } from "clipanion";
import { checkAuthStatus } from "../services/auth.service.js";
import {
  getCurrentOrganization,
  getUserOrganizations,
  setCurrentOrganization,
} from "../services/organization.service.js";
import { table } from "../utils/console-ui.js";
import { log } from "../utils/logger.js";

type RouterOutput = inferRouterOutputs<AppRouter>;
type Organization = RouterOutput["organizations"]["list"][number];

export class OrgsCommand extends Command {
  static paths = [["orgs"]];

  static usage = Command.Usage({
    description: "List all organizations you have access to",
  });

  async execute() {
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) {
      log.error("You need to be logged in to view organizations.");
      log.info("Run 'origan login' to authenticate.");
      return 1;
    }

    try {
      const organizations = await getUserOrganizations();

      if (organizations.length === 0) {
        log.warn("You don't have access to any organizations.");
        return 0;
      }

      const currentOrg = await getCurrentOrganization();

      const tableData = organizations.map((org: Organization) => {
        const isCurrent = org.reference === currentOrg?.reference;
        return {
          "Org Name": org.name,
          "Org Ref": org.reference,
          Selected: isCurrent ? "true" : "",
        };
      });

      table(tableData);
    } catch (error) {
      log.error(
        "Failed to fetch organizations:",
        error instanceof Error ? error.message : "Unknown error",
      );
      return 1;
    }

    return 0;
  }
}

export class OrgSwitchCommand extends Command {
  static paths = [["switch"]];

  static usage = Command.Usage({
    description: "Switch between organizations",
    details: "Switch to a different organization by providing its reference.",
    examples: [["Switch to specific org", "$0 switch my-org-ref"]],
  });

  organizationReference = Option.String({ required: true });

  async execute() {
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) {
      log.error("You need to be logged in to switch organizations.");
      log.info("Run 'origan login' to authenticate.");
      return 1;
    }

    try {
      const organizations = await getUserOrganizations();

      if (organizations.length === 0) {
        log.warn("You don't have access to any organizations.");
        return 0;
      }

      if (organizations.length === 1) {
        log.info(
          `You only have access to one organization: ${organizations[0].name}`,
        );
        return 0;
      }

      const currentOrg = await getCurrentOrganization();

      const selectedOrg = organizations.find(
        (org: Organization) => org.reference === this.organizationReference,
      );

      if (!selectedOrg) {
        log.error(
          `Organization with reference '${this.organizationReference}' not found.`,
        );
        log.info("Run 'origan orgs' to see available organizations.");
        return 1;
      }

      if (selectedOrg.reference === currentOrg?.reference) {
        log.info(`Already on organization '${selectedOrg.name}'.`);
        return 0;
      }

      await setCurrentOrganization({
        reference: selectedOrg.reference,
      });

      log.success(
        `Switched to organization '${selectedOrg.name}' (${selectedOrg.reference})`,
      );
    } catch (error) {
      log.error(
        "Failed to switch organization:",
        error instanceof Error ? error.message : "Unknown error",
      );
      return 1;
    }

    return 0;
  }
}
