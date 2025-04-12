#!/usr/bin/env node
import { Command } from "commander";
import * as R from "remeda";
import { login, logout } from "./services/auth.service.js";
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

const program = new Command();

program.name("origan").description("Origan CLI tool").version("0.1.0");

program
  .command("start")
  .description("Start Origan services")
  .action(async () => {
    console.log("Starting Origan services...");
    // TODO: Implement service startup logic
  });

program
  .command("login")
  .description("Login to Origan")
  .action(async () => {
    await login();
  });

program
  .command("logout")
  .description("Logout from Origan")
  .action(async () => {
    await logout();
  });

program
  .command("deploy")
  .description("Deploy your application")
  .option("-b, --branch <name>", "Branch name", "main")
  .action(async (options) => {
    await deploy(options.branch);
  });

program
  .command("projects")
  .description("List all projects")
  .action(async () => {
    const projects = await getProjects();

    table(
      projects.map((p) =>
        R.pipe(
          p,
          R.omit(["deployments"]),
          R.merge({
            deployments: p.deployments.map((d) => d.shortId).join(", "),
          }),
        ),
      ),
      ["reference", "name", "deployments", "createdAt", "updatedAt"],
    );
  });

program
  .command("deployments")
  .description("List all deployments")
  .option("-p, --project <id>", "Project ID")
  .action(async (options) => {
    let projectRef = options.project;
    if (!projectRef) {
      try {
        const config = await parseOriganConfig();
        projectRef = config.projectRef;
      } catch (error) {
        let err: string;
        if (error instanceof OriganConfigNotFoundError) {
          err = "No origan.jsonc file found. Retry in a project directory";
        } else if (error instanceof OriganConfigInvalidError) {
          // TODO: Improve error message in case of validation error
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
      ["shortId", "hosts", "createdAt", "updatedAt"],
    );
  });

program
  .command("dev")
  .description("Start development environment")
  .action(async () => {
    await startDev();
  });

program
  .command("init")
  .description("Initialize Origan configuration")
  .action(async () => {
    await init();
  });

program.parse();
