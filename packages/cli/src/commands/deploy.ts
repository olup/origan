import { Command, Option } from "clipanion";
import { deploy } from "../services/deploy.service.js";

export class DeployCommand extends Command {
  static paths = [["deploy"]];

  trackName = Option.String("-t,--track", "", {
    description: "Track name",
  });

  async execute() {
    await deploy(this.trackName || undefined);
  }
}
