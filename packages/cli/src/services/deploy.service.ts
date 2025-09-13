import { readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { trpc } from "../libs/trpc-client.js";
import type { OriganConfig } from "../types.js";
import {
  cleanDirectory,
  collectFiles,
  createDirectories,
  validateDirectory,
} from "../utils/file.js";
import { log } from "../utils/logger.js";
import {
  OriganConfigInvalidError,
  OriganConfigNotFoundError,
  parseOriganConfig,
} from "../utils/origan.js";
import type { Route, RouteConfig } from "../utils/path.js";
import { createRouteFromFile } from "../utils/path.js";
import { bundleApiRoute, createDeploymentArchive } from "../utils/zip.js";
import { getProjectByRef } from "./project.service.js";

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

async function uploadArchive(
  archivePath: string,
  projectRef: string,
  origanConfig: ConfigJson,
  trackName?: string,
) {
  log.info("Uploading deployment package...");
  const stats = await stat(archivePath);
  log.info(`Total size: ${(stats.size / 1024).toFixed(2)} KB`);

  // Read the zip file
  const zipBuffer = await readFile(archivePath);

  // Create FormData
  const formData = new FormData();
  formData.append("projectRef", projectRef);
  formData.append("config", JSON.stringify(origanConfig));
  if (trackName) {
    formData.append("trackName", trackName);
  }

  // Create a File from the buffer
  const zipFile = new File([zipBuffer], "bundle.zip", {
    type: "application/zip",
  });
  formData.append("bundle", zipFile);

  log.info("Uploading to server...");

  try {
    const result = await trpc.deployments.create.mutate(formData);
    log.info("Deployment uploaded successfully");
    return result;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to upload deployment: ${error.message}`);
    }
    throw new Error("Failed to upload deployment");
  }
}

export async function deploy(trackName?: string): Promise<void> {
  try {
    log.info("Starting deployment process...");

    // ugh, should be const but shitty try/catch make it impossible
    let config: OriganConfig;
    try {
      config = await parseOriganConfig();
    } catch (error) {
      if (error instanceof OriganConfigNotFoundError) {
        log.error(error.message);
        return;
      }
      if (error instanceof OriganConfigInvalidError) {
        log.error(error.message);
        return;
      }
      throw error;
    }

    // Check if project exists. Error is already handled by the function.
    await getProjectByRef(config.projectRef);

    // Create required directories
    const artifactsDir = join(process.cwd(), ".origan", "artifacts");
    const buildDir = join(process.cwd(), ".origan", "build");

    log.info("Creating build directories...");
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

      log.info(`Found ${routes.length} API routes`);
    } else if (config.apiDir) {
      log.info(`No ${config.apiDir}/ directory found, skipping API routes`);
    }

    // Collect and validate app
    log.info("\nProcessing application...");
    const appFiles = collectFiles(appDir);

    if (appFiles.length === 0) {
      throw new Error(
        `No app files found in ${config.appDir}/ directory. Please build your application first.`,
      );
    }
    log.info(`Found ${appFiles.length} app files in ${config.appDir}/`);

    log.info("Generating deployment configuration...");
    const deployConfig = generateConfig(appFiles, routes, appDir);

    // Bundle routes
    if (routes.length > 0) {
      log.info("\nProcessing API routes:");
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
      deployConfig,
      trackName,
    );

    log.success("Deployment uploaded successfully! ✨");

    // Fetch deployment details
    const deploymentDetails = await getDeploymentByRef(
      deploymentResult.deploymentReference,
    );

    log.info("\nDeployment URLs:");

    for (const domain of deploymentDetails.domains) {
      log.success(`- https://${domain.name}`);
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

export async function getDeployments(projectRef: string) {
  const data = await trpc.projects.get.query({ reference: projectRef });
  return data.deployments;
}

export async function getDeploymentByRef(deploymentRef: string) {
  return await trpc.deployments.getByRef.query({ ref: deploymentRef });
}
