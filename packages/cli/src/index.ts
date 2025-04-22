#!/usr/bin/env node
import { Cli, Command, Option } from "clipanion";
import pc from "picocolors";
import * as R from "remeda";
import { login, logout, whoami } from "./services/auth.service.js";
import {
  deploy,
  getDeploymentByRef,
  getDeployments,
} from "./services/deploy.service.js";
import { startDev } from "./services/dev.service.js";
import { init } from "./services/init.service.js";
import { streamLogs } from "./services/logs.service.js";
import { getProjectByRef, getProjects } from "./services/project.service.js";
import { table } from "./utils/console-ui.js";
import { log } from "./utils/logger.js";
import {
  OriganConfigInvalidError,
  OriganConfigNotFoundError,
  parseOriganConfig,
} from "./utils/origan.js";

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

  branch = Option.String("-b,--branch", "main", {
    description: "Branch name",
  });

  async execute() {
    await deploy(this.branch);
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
      projects.map((p) =>
        R.pipe(
          p,
          R.omit(["deployments", "githubConfig"]),
          R.merge({
            deployments: p.deployments.map((d) => d.reference).join(", "),
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
      deployments.map((d) =>
        R.pipe(
          d,
          R.omit(["hosts"]),
          R.merge({
            hosts: d.hosts.map((h) => h.name).join(", "),
          }),
        ),
      ),
      ["reference", "id", "hosts", "createdAt", "updatedAt"],
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

cli.runExit(process.argv.slice(2));
