#!/usr/bin/env node
import { Cli } from "clipanion";
import { LoginCommand, LogoutCommand, WhoamiCommand } from "./commands/auth.js";
import { DeployCommand } from "./commands/deploy.js";
import { DevCommand } from "./commands/dev.js";
import {
  EnvGetVarsCommand,
  EnvListCommand,
  EnvSetVarCommand,
  EnvUnsetVarCommand,
} from "./commands/environment.js";
import { InitCommand } from "./commands/init.js";
import { LogsCommand } from "./commands/logs.js";
import { OrgSwitchCommand, OrgsCommand } from "./commands/organization.js";
import { DeploymentsCommand, ProjectsCommand } from "./commands/project.js";

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
cli.register(OrgsCommand);
cli.register(OrgSwitchCommand);
cli.register(EnvListCommand);
cli.register(EnvGetVarsCommand);
cli.register(EnvSetVarCommand);
cli.register(EnvUnsetVarCommand);

cli.runExit(process.argv.slice(2));
