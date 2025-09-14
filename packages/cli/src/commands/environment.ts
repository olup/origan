import { Command, Option } from "clipanion";
import { checkAuthStatus } from "../services/auth.service.js";
import {
  getEnvironments,
  getEnvironmentVariables,
  setEnvironmentVariables,
  unsetEnvironmentVariable,
} from "../services/environment.service.js";
import { table } from "../utils/console-ui.js";
import { log } from "../utils/logger.js";
import {
  OriganConfigInvalidError,
  OriganConfigNotFoundError,
  parseOriganConfig,
} from "../utils/origan.js";

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

export class EnvListCommand extends Command {
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

export class EnvGetVarsCommand extends Command {
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

export class EnvSetVarCommand extends Command {
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

    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) {
      log.error("You need to be logged in to manage environments.");
      log.info("Run 'origan login' to authenticate.");
      return 1;
    }

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

export class EnvUnsetVarCommand extends Command {
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
