#!/usr/bin/env node
import { Cli, Command, Option } from "clipanion";
import * as R from "remeda";
import { login, logout, whoami } from "./services/auth.service.js";
import { deploy, getDeployments } from "./services/deploy.service.js";
import { startDev } from "./services/dev.service.js";
import { init } from "./services/init.service.js";
import { getProjects } from "./services/project.service.js";
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
          R.omit(["deployments"]),
          R.merge({
            deployments: p.deployments.map((d) => d.reference).join(", "),
          }),
        ),
      ),
      ["reference", "name", "deployments", "createdAt", "updatedAt"],
    );
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
    let projectRef = this.project;
    if (!projectRef) {
      try {
        const config = await parseOriganConfig();
        projectRef = config.projectRef;
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
      ["reference", "hosts", "createdAt", "updatedAt"],
    );
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

cli.runExit(process.argv.slice(2));
