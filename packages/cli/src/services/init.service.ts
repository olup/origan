import { appendFile, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import prompts from "prompts";
import type { OriganConfig } from "../types.js";
import { log } from "../utils/logger.js";
import { createProject, getProjects } from "./project.service.js";

export async function init() {
  const origanConfigPath = join(process.cwd(), "origan.jsonc");

  // Check if we're in a project root by looking for package.json
  try {
    await stat(join(process.cwd(), "package.json"));
  } catch (_error) {
    log.error(
      "package.json not found. Please run 'origan init' from your project root directory.",
    );
    return;
  }

  // Check if origan.jsonc already exists
  try {
    await stat(origanConfigPath);
    const { proceed } = await prompts({
      type: "confirm",
      name: "proceed",
      message: "origan.jsonc already exists. Do you want to replace it?",
      initial: false,
    });

    if (!proceed) {
      log.info("Operation cancelled");
      return;
    }
  } catch (_error) {
    // File doesn't exist, proceed with creation
  }

  // First determine if we're creating a new project or selecting an existing one
  const { action } = await prompts({
    type: "select",
    name: "action",
    message:
      "Would you like to create a new project or select an existing one?",
    choices: [
      { title: "Create new project", value: "create" },
      { title: "Select existing project", value: "select" },
    ],
  });

  if (!action) {
    log.info("Operation cancelled");
    return;
  }

  let projectRef: string;
  let projectName: string;

  if (action === "create") {
    // Create new project flow
    const { name } = await prompts({
      type: "text",
      name: "name",
      message: "Project name",
      validate: (value) =>
        value.length > 0 ? true : "Project name is required",
    });

    if (!name) {
      log.info("Operation cancelled");
      return;
    }

    projectName = name;

    try {
      const project = await createProject(projectName);
      projectRef = project.reference;

      log.success(`Created new project: ${projectName}`);
    } catch (error) {
      log.error(
        `Failed to create project: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }
  } else {
    // Select existing project flow
    try {
      const projects = await getProjects();

      if (projects.length === 0) {
        log.error(
          "No existing projects found. Please create a new project instead.",
        );
        return;
      }

      const { selected } = await prompts({
        type: "select",
        name: "selected",
        message: "Select a project",
        choices: projects.map((p) => ({
          title: `${p.name} (${p.reference})`,
          value: p.reference,
        })),
      });

      if (!selected) {
        log.info("Operation cancelled");
        return;
      }

      const selectedProject = projects.find((p) => p.reference === selected);
      if (!selectedProject) {
        log.error("Selected project not found");
        return;
      }

      projectRef = selectedProject.reference;
      projectName = selectedProject.name;
    } catch (error) {
      log.error(
        `Failed to fetch projects: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }
  }

  // Continue with the rest of the configuration
  const configResponse = await prompts([
    {
      type: "text",
      name: "appDir",
      message: "Front end app directory",
      initial: "dist",
    },
    {
      type: "text",
      name: "apiDir",
      message: "API function directory (optional)",
    },
  ]);

  if (!configResponse.appDir) {
    log.info("Operation cancelled");
    return;
  }

  const config: OriganConfig = {
    // Origan config version
    version: 1,

    // Directory containing the built app files
    appDir: configResponse.appDir,

    // Optional directory containing serverless API functions
    ...(configResponse.apiDir ? { apiDir: configResponse.apiDir } : {}),

    // Reference to the project in the Origan control panel
    projectRef,
  };

  // Write the configuration with comments
  const configContent = `{
  // Origan config version
  "version": 1,

  // Directory containing the built app files
  "appDir": "${config.appDir}",

${
  configResponse.apiDir
    ? `  // Directory containing serverless API functions
  "apiDir": "${configResponse.apiDir}",

`
    : ""
}  // Reference to the project in the Origan control panel (${projectName})
  "projectRef": "${config.projectRef}"
}`;

  await writeFile(join(process.cwd(), "origan.jsonc"), configContent);

  // Add .origan to .gitignore if not already present
  const gitignorePath = join(process.cwd(), ".gitignore");
  try {
    const gitignoreContent = await readFile(gitignorePath, "utf-8");
    if (!gitignoreContent.includes(".origan")) {
      await appendFile(gitignorePath, "\n.origan\n");
      log.info("Added .origan to .gitignore");
    }
  } catch (_error) {
    // .gitignore doesn't exist, create it
    await writeFile(gitignorePath, ".origan\n");
    log.info("Created .gitignore with .origan entry");
  }

  log.success("Created origan.jsonc configuration file");
}
