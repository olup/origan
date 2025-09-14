import { Command } from "clipanion";
import { startDev } from "../services/dev.service.js";

export class DevCommand extends Command {
  static paths = [["dev"]];

  static usage = Command.Usage({
    description: "Start development environment",
  });

  async execute() {
    await startDev();
  }
}
