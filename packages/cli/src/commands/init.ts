import { Command } from "clipanion";
import { init } from "../services/init.service.js";

export class InitCommand extends Command {
  static paths = [["init"]];

  async execute() {
    await init();
  }
}
