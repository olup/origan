import { createRequire } from "module";
import { writeFile, stat, readFile, appendFile } from "fs/promises";
import { join } from "path";
import prompts from "prompts";
import type { OriganConfig } from "../types.js";
import { log } from "../utils/logger.js";

export async function init() {
  const origanConfigPath = join(process.cwd(), "origan.jsonc");

  // Check if we're in a project root by looking for package.json
  try {
    await stat(join(process.cwd(), "package.json"));
  } catch (error) {
    log.error(
      "package.json not found. Please run 'origan init' from your project root directory."
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
  } catch (error) {
    // File doesn't exist, proceed with creation
  }

  const responses = await prompts([
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
    {
      type: "text",
      name: "projectRef",
      message: "Project reference",
      validate: (value) =>
        value.length > 0 ? true : "Project reference is required",
    },
  ]);

  // If user cancelled during prompts
  if (!responses.appDir || !responses.projectRef) {
    log.info("Operation cancelled");
    return;
  }

  const config: OriganConfig = {
    // Origan config version
    version: 1,

    // Directory containing the built app files
    appDir: responses.appDir || "dist",

    // Optional directory containing serverless API functions
    ...(responses.apiDir ? { apiDir: responses.apiDir } : {}),

    // Reference to the project in the Origan control panel
    projectRef: responses.projectRef,
  };

  // Write the configuration with comments
  const configContent = `{
  // Origan config version
  "version": 1,

  // Directory containing the built app files
  "appDir": "${config.appDir}",

${
  responses.apiDir
    ? `  // Directory containing serverless API functions
  "apiDir": "${responses.apiDir}",

`
    : ""
}\  // Reference to the project in the Origan control panel
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
  } catch (error) {
    // .gitignore doesn't exist, create it
    await writeFile(gitignorePath, ".origan\n");
    log.info("Created .gitignore with .origan entry");
  }

  log.success("Created origan.jsonc configuration file");
}
