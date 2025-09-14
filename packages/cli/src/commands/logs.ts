import { Command, Option } from "clipanion";
import pc from "picocolors";
import {
  getDeploymentByRef,
  getDeployments,
} from "../services/deploy.service.js";
import { streamLogs } from "../services/logs.service.js";
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

export class LogsCommand extends Command {
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
      const deployments = await getDeployments(projectId);
      return deployments[deployments.length - 1].id;
    }

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
