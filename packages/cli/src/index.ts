#!/usr/bin/env node
import { Command } from "commander";
import { login, logout } from "./services/auth.service.js";
import { deploy } from "./services/deploy.service.js";
import { startDev } from "./services/dev.service.js";
import { init } from "./services/init.service.js";

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
