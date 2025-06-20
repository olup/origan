import { stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { getAuthenticatedClient } from "../libs/client.js";
import type { OriganConfig } from "../types.js";
import { ProgressBar } from "../utils/cli.js";
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
import { uploadFormWithProgress } from "../utils/upload.js";
import { bundleApiRoute, createDeploymentArchive } from "../utils/zip.js";
import { getAccessToken } from "./auth.service.js";

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
  origanConfig: ConfigJson,
): Promise<DeploymentResponse> {
  log.info("Uploading deployment package...");
  const stats = await stat(archivePath);
  log.info(`Total size: ${(stats.size / 1024).toFixed(2)} KB`);

  const client = await getAuthenticatedClient();
  const token = await getAccessToken();
  if (!token) {
    throw new Error("No access token found. Please log in.");
  }

  const deployUrl = client.deployments.create.$url().toString();

  const progressBar = new ProgressBar();

  const response = await uploadFormWithProgress(
    deployUrl,
    {
      Authorization: `Bearer ${token}`,
    },
    [
      { fieldName: "projectRef", value: projectRef },
      { fieldName: "branchRef", value: branch },
      { fieldName: "config", value: JSON.stringify(origanConfig) },
    ],
    [
      {
        fieldName: "bundle",
        path: archivePath,
        fileName: "bundle.zip",
        contentType: "application/zip",
      },
    ],
    (percentage) => {
      progressBar.update(percentage);
    },
  );
  progressBar.finish();
  return JSON.parse(response) as DeploymentResponse;
}

export async function deploy(branch = "main"): Promise<void> {
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

export async function getDeployments(projectRef: string) {
  const client = await getAuthenticatedClient();
  const response = await client.projects[":reference"].$get({
    param: {
      reference: projectRef,
    },
  });

  const data = await response.json();

  if ("error" in data) {
    throw new Error(
      `Failed to fetch deployments: ${(data as { error: string }).error}`,
    );
  }

  return data.deployments;
}

export async function getDeploymentByRef(deploymentRef: string) {
  const client = await getAuthenticatedClient();
  const response = await client.deployments["by-ref"][":ref"].$get({
    param: {
      ref: deploymentRef,
    },
  });

  const data = await response.json();

  if ("error" in data) {
    throw new Error(
      `Failed to fetch deployments: ${(data as { error: string }).error}`,
    );
  }

  return data;
}
