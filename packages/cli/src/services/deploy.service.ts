import { readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse } from "comment-json";
import { client } from "../libs/client.js";
import { origanConfigSchema } from "../types.js";
import {
  cleanDirectory,
  collectFiles,
  createDirectories,
  validateDirectory,
} from "../utils/file.js";
import { log } from "../utils/logger.js";
import type { Route, RouteConfig } from "../utils/path.js";
import { createRouteFromFile } from "../utils/path.js";
import { bundleApiRoute, createDeploymentArchive } from "../utils/zip.js";

interface ConfigJson {
  app: string[];
  api: RouteConfig[];
}

function generateConfig(
  appFiles: string[],
  api: Route[],
  appDir: string,
): ConfigJson {
  return {
    app: appFiles.map((f) => join(relative(appDir, f))),
    api: api.map((route) => ({
      urlPath: route.urlPath,
      functionPath: route.bundlePath,
    })),
  };
}

function generateUUID(): string {
  return crypto.randomUUID();
}

interface DeploymentResponse {
  status: string;
  message: string;
  projectRef: string;
  deploymentId: string;
  urls: string[];
}

async function uploadArchive(
  archivePath: string,
  projectRef: string,
  branch: string,
  config: ConfigJson,
): Promise<DeploymentResponse> {
  const file = new File([await readFile(archivePath)], "bundle.zip", {
    type: "application/zip",
  });

  log.info("Uploading deployment package...");
  log.info(`Total size: ${(file.size / 1024).toFixed(2)} KB`);

  const response = await client.deployments.create.$post({
    form: {
      projectRef,
      branchRef: branch,
      config: JSON.stringify(config),
      bundle: file,
    },
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${await response.text()}`);
  }

  return response.json();
}

export async function deploy(branch = "main"): Promise<void> {
  try {
    log.info("Starting deployment process...");

    // Check for origan.jsonc file
    const origanConfigPath = join(process.cwd(), "origan.jsonc");

    try {
      await stat(origanConfigPath);
    } catch (error) {
      log.error(
        "origan.jsonc not found. Please run 'origan init' to configure your project first.",
      );
      return;
    }

    // Read and parse config
    const origanContent = await readFile(origanConfigPath, "utf-8");
    const parsedConfig = parse(origanContent) as unknown;

    const result = origanConfigSchema.safeParse(parsedConfig);
    if (!result.success) {
      throw new Error(
        `Invalid origan.jsonc: ${result.error.message}\nPlease run 'origan init' to create a valid config.`,
      );
    }

    const config = result.data;

    // Create required directories
    const artifactsDir = join(process.cwd(), ".origan", "artifacts");
    const buildDir = join(process.cwd(), ".origan", "build");

    console.log("Creating build directories...");
    createDirectories([artifactsDir, buildDir, join(buildDir, "api")]);

    // Discover and validate directories
    const appDir = join(process.cwd(), config.appDir);
    const apiDir = config.apiDir
      ? join(process.cwd(), config.apiDir)
      : undefined;

    if (!validateDirectory(appDir)) {
      log.error(
        `${config.appDir}/ directory not found. Please build your application first.`,
      );
      return;
    }

    // Discover API routes if api directory exists
    let routes: Route[] = [];

    if (apiDir && validateDirectory(apiDir)) {
      log.info("Discovering API routes...");

      const apiFiles = collectFiles(apiDir).filter(
        (file) => file.endsWith(".ts") && !file.includes("/_"),
      );

      routes = apiFiles
        .map((file) => createRouteFromFile(apiDir, file))
        .sort((a, b) => a.urlPath.length - b.urlPath.length);

      console.log(`Found ${routes.length} API routes`);
    } else if (config.apiDir) {
      console.log(`No ${config.apiDir}/ directory found, skipping API routes`);
    }

    // Collect and validate app
    console.log("\nProcessing application...");
    const appFiles = collectFiles(appDir);

    if (appFiles.length === 0) {
      throw new Error(
        `No app files found in ${config.appDir}/ directory. Please build your application first.`,
      );
    }
    console.log(`Found ${appFiles.length} app files in ${config.appDir}/`);

    console.log("Generating deployment configuration...");
    const deployConfig = generateConfig(appFiles, routes, appDir);

    // Bundle routes
    if (routes.length > 0) {
      console.log("\nProcessing API routes:");
      for (const route of routes) {
        try {
          const content = await bundleApiRoute(route);
          await writeFile(
            join(buildDir, "api", route.bundlePath),
            content,
            "utf-8",
          );
          log.info(`  ${route.urlPath} -> ${route.bundlePath}  ✓`);
        } catch (error) {
          if (error instanceof Error) {
            log.error(`  Error bundling ${route.urlPath}: ${error.message}`);
          }
          throw new Error(
            `Failed to bundle route ${route.urlPath} (${route.filePath})`,
          );
        }
      }

      log.info("\nAPI routes processing complete");
    }

    const uuid = generateUUID();
    const bundle = await createDeploymentArchive(
      artifactsDir,
      uuid,
      appFiles,
      routes,
      appDir,
      buildDir,
    );

    log.success("\nDeployment Summary:");
    log.success("------------------");
    log.success(`App Files in ${config.appDir}/: ${appFiles.length}`);
    log.success(`API Routes: ${routes.length}`);
    log.success(`Artifact: ${bundle.path}`);
    log.success(`Size: ${(bundle.size / 1024).toFixed(2)} KB`);

    log.info("\nUploading deployment package...");
    const deploymentResult = await uploadArchive(
      bundle.path,
      config.projectRef,
      branch,
      deployConfig,
    );
    log.success("Deployment uploaded successfully! ✨");

    log.info("\nDeployment URLs:");
    for (const url of deploymentResult.urls) {
      log.success(`  ${url}`);
    }

    // Clean up deployment directories
    log.debug("Cleaning up deployment directories...");
    cleanDirectory(artifactsDir);
    cleanDirectory(buildDir);
    log.debug("Cleanup completed");
  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}
