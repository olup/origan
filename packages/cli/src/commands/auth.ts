import { Command } from "clipanion";
import { login, logout, whoami } from "../services/auth.service.js";

export class LoginCommand extends Command {
  static paths = [["login"]];

  async execute() {
    await login();
  }
}

export class WhoamiCommand extends Command {
  static paths = [["whoami"]];

  async execute() {
    await whoami();
  }
}

export class LogoutCommand extends Command {
  static paths = [["logout"]];

  async execute() {
    await logout();
  }
}
