import type { AppRouter } from "@origan/control-api/src/trpc/router";
import type { inferRouterOutputs } from "@trpc/server";
import { Command, Option } from "clipanion";
import * as R from "remeda";
import { getDeployments } from "../services/deploy.service.js";
import { getProjects } from "../services/project.service.js";
import { table } from "../utils/console-ui.js";
import { log } from "../utils/logger.js";
import {
  OriganConfigInvalidError,
  OriganConfigNotFoundError,
  parseOriganConfig,
} from "../utils/origan.js";

type RouterOutput = inferRouterOutputs<AppRouter>;
type Project = RouterOutput["projects"]["list"][number];

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

export class ProjectsCommand extends Command {
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

export class DeploymentsCommand extends Command {
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
