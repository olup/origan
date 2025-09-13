#!/usr/bin/env node
import type { AppRouter } from "@origan/control-api/src/trpc/router";
import type { inferRouterOutputs } from "@trpc/server";
// TODO: Split each command into its own file for better organization
import { Cli, Command, Option } from "clipanion";
import pc from "picocolors";
import * as R from "remeda";
import {
  checkAuthStatus,
  login,
  logout,
  whoami,
} from "./services/auth.service.js";
import {
  deploy,
  getDeploymentByRef,
  getDeployments,
} from "./services/deploy.service.js";
import { startDev } from "./services/dev.service.js";
import {
  getEnvironments,
  getEnvironmentVariables,
  setEnvironmentVariables,
  unsetEnvironmentVariable,
} from "./services/environment.service.js";
import { init } from "./services/init.service.js";
import { streamLogs } from "./services/logs.service.js";
import {
  getCurrentOrganization,
  getUserOrganizations,
  setCurrentOrganization,
} from "./services/organization.service.js";
import { getProjects } from "./services/project.service.js";
import { table } from "./utils/console-ui.js";
import { log } from "./utils/logger.js";
import {
  OriganConfigInvalidError,
  OriganConfigNotFoundError,
  parseOriganConfig,
} from "./utils/origan.js";

type RouterOutput = inferRouterOutputs<AppRouter>;
type Project = RouterOutput["projects"]["list"][number];
type Organization = RouterOutput["organizations"]["list"][number];

class LoginCommand extends Command {
  static paths = [["login"]];

  async execute() {
    await login();
  }
}

class WhoamiCommand extends Command {
  static paths = [["whoami"]];

  async execute() {
    await whoami();
  }
}

class LogoutCommand extends Command {
  static paths = [["logout"]];

  async execute() {
    await logout();
  }
}

class DeployCommand extends Command {
  static paths = [["deploy"]];

  trackName = Option.String("-t,--track", "", {
    description: "Track name",
  });

  async execute() {
    await deploy(this.trackName || undefined);
  }
}

class ProjectsCommand extends Command {
  static paths = [["projects"]];
  static usage = Command.Usage({
    description: "List all projects",
    details: "This command lists all projects in the Origan system.",
    examples: [["List all projects", "$0 projects"]],
  });
  async execute() {
    const projects = await getProjects();
    table(
      projects.map((p: Project) =>
        R.pipe(
          p,
          R.omit([
            "deployments",
            "githubConfig",
            "id",
            "organizationId",
            "creatorId",
            "deletedAt",
          ]),
          R.merge({
            deployments: p.deployments.map((d) => d.reference).join(", "),
            createdAt: p.createdAt.toISOString(),
            updatedAt: p.updatedAt,
          }),
        ),
      ),
      ["reference", "name", "deployments", "createdAt", "updatedAt"],
    );
  }
}

async function getProjectFromConfig() {
  try {
    const config = await parseOriganConfig();
    return config.projectRef;
  } catch (error) {
    let err: string;
    if (error instanceof OriganConfigNotFoundError) {
      err = "No origan.jsonc file found. Retry in a project directory";
    } else if (error instanceof OriganConfigInvalidError) {
      err = `Invalid origan.jsonc file: ${error.message}. Fix the error`;
    } else {
      throw error;
    }
    log.error(`${err} or pass \`--project <project-ref>\` as an argument.`);
    return;
  }
}

class DeploymentsCommand extends Command {
  static paths = [["deployments"]];
  static usage = Command.Usage({
    description: "List all deployments",
    details: "This command lists all deployments in the Origan system.",
    examples: [["List all deployments", "$0 deployments"]],
  });

  project = Option.String("-p,--project", "", {
    description: "Project ID",
  });

  async execute() {
    const projectRef = this.project || (await getProjectFromConfig());
    if (!projectRef) {
      return 1;
    }

    const deployments = await getDeployments(projectRef);
    table(
      deployments.map((d) => ({
        reference: d.reference,
        id: d.id,
        status: d.status,
        domains: d.domains.map((h) => h.name).join(", "),
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt,
      })),
      ["reference", "id", "status", "domains", "createdAt", "updatedAt"],
    );
  }
}

class LogsCommand extends Command {
  static paths = [["logs"]];

  static usage = Command.Usage({
    description: "Show logs",
    details: "This command shows logs for a deployment.",
    examples: [["Show logs", "$0 log"]],
  });

  project = Option.String("-p,--project", {
    description: "Project reference.",
  });

  deployment = Option.String("-d,--deployment", {
    description:
      "Deployment ID or reference. If not provided, the latest deployment will be used.",
  });

  async execute() {
    const projectRef = this.project || (await getProjectFromConfig());
    if (!projectRef) {
      return 1;
    }

    const deploymentId = await this.getDeploymentId(
      projectRef,
      this.deployment,
    );

    await streamLogs(deploymentId, (log) => {
      const levelColor =
        {
          error: pc.red,
          warning: pc.yellow,
          info: pc.green,
          debug: pc.dim,
        }[log.level.toLowerCase()] || pc.white;
      const levelStr = `${log.timestamp} ${levelColor(log.level)}`;
      console.log(levelStr, log.msg.trimEnd());
    });
  }

  async getDeploymentId(
    projectId: string,
    deploymentIdOrRef: string | undefined,
  ): Promise<string> {
    if (deploymentIdOrRef == null) {
      // Fetch the latest deployment
      const deployments = await getDeployments(projectId);
      // FIXME: Have a dedicated endpoint to get the latest deployment
      return deployments[deployments.length - 1].id;
    }

    // It's a deployment ID already, we can just return it.
    if (deploymentIdOrRef.length === 36) {
      return deploymentIdOrRef;
    }
    const deployment = await getDeploymentByRef(deploymentIdOrRef);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentIdOrRef} not found`);
    }
    return deployment.id;
  }
}

class DevCommand extends Command {
  static paths = [["dev"]];

  static usage = Command.Usage({
    description: "Start development environment",
  });

  async execute() {
    await startDev();
  }
}

class InitCommand extends Command {
  static paths = [["init"]];

  async execute() {
    await init();
  }
}

class OrgsCommand extends Command {
  static paths = [["orgs"]];

  static usage = Command.Usage({
    description: "List all organizations you have access to",
  });

  async execute() {
    // Check if user is authenticated
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) {
      log.error("You need to be logged in to view organizations.");
      log.info("Run 'origan login' to authenticate.");
      return 1;
    }

    try {
      // Get all organizations
      const organizations = await getUserOrganizations();

      if (organizations.length === 0) {
        log.warn("You don't have access to any organizations.");
        return 0;
      }

      // Get current organization
      const currentOrg = await getCurrentOrganization();

      // Prepare data for table
      const tableData = organizations.map((org: Organization) => {
        const isCurrent = org.reference === currentOrg?.reference;
        return {
          "Org Name": org.name,
          "Org Ref": org.reference,
          Selected: isCurrent ? "true" : "",
        };
      });

      // Display table
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

class EnvListCommand extends Command {
  static paths = [["env", "list"]];

  static usage = Command.Usage({
    description: "List all environments for a project",
    examples: [["List all environments", "$0 env list"]],
  });

  project = Option.String("-p,--project", {
    description: "Project reference",
  });

  async execute() {
    const projectRef = this.project || (await getProjectFromConfig());
    if (!projectRef) {
      return 1;
    }

    // Check if user is authenticated
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) {
      log.error("You need to be logged in to manage environments.");
      log.info("Run 'origan login' to authenticate.");
      return 1;
    }

    try {
      const environments = await getEnvironments(projectRef);

      if (environments.length === 0) {
        log.warn("No environments found for this project.");
        return 0;
      }

      table(
        environments.map((env) => ({
          Name: env.name,
          Default: env.isDefault ? "Yes" : "No",
          System: env.isSystem ? "Yes" : "No",
          Variables: String(Object.keys(env.variables).length),
        })),
      );
    } catch (error) {
      log.error(
        "Failed to list environments:",
        error instanceof Error ? error.message : "Unknown error",
      );
      return 1;
    }

    return 0;
  }
}

class EnvGetVarsCommand extends Command {
  static paths = [["env", "get-vars"]];

  static usage = Command.Usage({
    description: "Get environment variables",
    examples: [["Get production variables", "$0 env get-vars production"]],
  });

  environmentName = Option.String({ required: true });

  project = Option.String("-p,--project", {
    description: "Project reference",
  });

  async execute() {
    const projectRef = this.project || (await getProjectFromConfig());
    if (!projectRef) {
      return 1;
    }

    // Check if user is authenticated
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) {
      log.error("You need to be logged in to manage environments.");
      log.info("Run 'origan login' to authenticate.");
      return 1;
    }

    try {
      const { environment, variables } = await getEnvironmentVariables(
        projectRef,
        this.environmentName,
      );

      log.info(`Environment: ${environment.name}`);

      if (Object.keys(variables).length === 0) {
        log.warn("No variables set for this environment.");
        return 0;
      }

      // Display variables as table
      const tableData = Object.entries(variables).map(([key, value]) => ({
        Key: key,
        Value: value,
      }));

      table(tableData);
    } catch (error) {
      log.error(
        "Failed to get environment variables:",
        error instanceof Error ? error.message : "Unknown error",
      );
      return 1;
    }

    return 0;
  }
}

class EnvSetVarCommand extends Command {
  static paths = [["env", "set-var"]];

  static usage = Command.Usage({
    description: "Set environment variable(s)",
    details: "Set one or more environment variables in KEY=value format",
    examples: [
      ["Set a single variable", "$0 env set-var production API_KEY=secret"],
      [
        "Set multiple variables",
        "$0 env set-var production API_KEY=secret DB_URL=postgres://...",
      ],
    ],
  });

  environmentName = Option.String({ required: true });

  variables = Option.Rest({ required: 1 });

  project = Option.String("-p,--project", {
    description: "Project reference",
  });

  async execute() {
    const projectRef = this.project || (await getProjectFromConfig());
    if (!projectRef) {
      return 1;
    }

    // Check if user is authenticated
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) {
      log.error("You need to be logged in to manage environments.");
      log.info("Run 'origan login' to authenticate.");
      return 1;
    }

    // Parse KEY=value pairs
    const parsedVariables: Array<{ key: string; value: string }> = [];
    for (const varStr of this.variables) {
      const [key, ...valueParts] = varStr.split("=");
      if (!key || valueParts.length === 0) {
        log.error(`Invalid variable format: ${varStr}. Expected KEY=value`);
        return 1;
      }
      parsedVariables.push({ key, value: valueParts.join("=") });
    }

    try {
      await setEnvironmentVariables(
        projectRef,
        this.environmentName,
        parsedVariables,
      );

      log.success(
        `Set ${parsedVariables.length} variable(s) in ${this.environmentName} environment`,
      );
    } catch (error) {
      log.error(
        "Failed to set environment variables:",
        error instanceof Error ? error.message : "Unknown error",
      );
      return 1;
    }

    return 0;
  }
}

class EnvUnsetVarCommand extends Command {
  static paths = [["env", "unset-var"]];

  static usage = Command.Usage({
    description: "Remove environment variable",
    examples: [["Remove a variable", "$0 env unset-var production API_KEY"]],
  });

  environmentName = Option.String({ required: true });

  variableKey = Option.String({ required: true });

  project = Option.String("-p,--project", {
    description: "Project reference",
  });

  async execute() {
    const projectRef = this.project || (await getProjectFromConfig());
    if (!projectRef) {
      return 1;
    }

    // Check if user is authenticated
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) {
      log.error("You need to be logged in to manage environments.");
      log.info("Run 'origan login' to authenticate.");
      return 1;
    }

    try {
      await unsetEnvironmentVariable(
        projectRef,
        this.environmentName,
        this.variableKey,
      );

      log.success(
        `Removed variable ${this.variableKey} from ${this.environmentName} environment`,
      );
    } catch (error) {
      log.error(
        "Failed to unset environment variable:",
        error instanceof Error ? error.message : "Unknown error",
      );
      return 1;
    }

    return 0;
  }
}

class OrgSwitchCommand extends Command {
  static paths = [["switch"]];

  static usage = Command.Usage({
    description: "Switch between organizations",
    details: "Switch to a different organization by providing its reference.",
    examples: [["Switch to specific org", "$0 switch my-org-ref"]],
  });

  organizationReference = Option.String({ required: true });

  async execute() {
    // Check if user is authenticated
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) {
      log.error("You need to be logged in to switch organizations.");
      log.info("Run 'origan login' to authenticate.");
      return 1;
    }

    try {
      // Get all organizations
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

      // Get current organization
      const currentOrg = await getCurrentOrganization();

      // Find organization by reference
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

      // Switch to the new organization
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

const cli = new Cli({
  binaryName: "origan",
  binaryVersion: "0.1.0",
});

cli.register(LoginCommand);
cli.register(WhoamiCommand);
cli.register(LogoutCommand);
cli.register(DeployCommand);
cli.register(DevCommand);
cli.register(InitCommand);
cli.register(ProjectsCommand);
cli.register(DeploymentsCommand);
cli.register(LogsCommand);
cli.register(OrgsCommand);
cli.register(OrgSwitchCommand);
cli.register(EnvListCommand);
cli.register(EnvGetVarsCommand);
cli.register(EnvSetVarCommand);
cli.register(EnvUnsetVarCommand);

cli.runExit(process.argv.slice(2));
