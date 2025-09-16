import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import archiver from "archiver";
import * as esbuild from "esbuild";
import { getConfig } from "../config.js";
import { createControlApiClient } from "../libs/client.js";
import type { Logger } from "./logger.js";

interface Route {
  urlPath: string;
  functionPath: string;
}

interface BundleResult {
  path: string;
  size: number;
}

interface DeployConfig {
  app: string[];
  api: Route[];
}

const controlApiClient = createControlApiClient(
  getConfig().CONTROL_API_URL,
  getConfig().DEPLOY_TOKEN,
);

const listdirPath = async (
  dir: string,
  rootDir?: string,
): Promise<string[]> => {
  const files: string[] = [];
  const baseDir = rootDir || dir;
  const items = await readdir(dir);
  for (const item of items) {
    const itemPath = join(dir, item);
    if (existsSync(itemPath)) {
      if ((await stat(itemPath)).isDirectory()) {
        files.push(...(await listdirPath(itemPath, baseDir)));
      } else {
        files.push(relative(baseDir, itemPath));
      }
    }
  }
  return files;
};

async function bundleApiRoute(
  apiPath: string,
  route: Route,
  logger: Logger,
): Promise<string> {
  const entryPoint = join(apiPath, route.functionPath);

  await logger.info(`Bundling API route ${route.urlPath} from ${entryPoint}`);

  // Plugin to handle process.env and avoid double node: prefixing
  const nodeCompatPlugin: esbuild.Plugin = {
    name: "node-compat",
    setup(build) {
      // Handle bare Node.js imports (without node: prefix)
      build.onResolve(
        {
          filter:
            /^(fs|path|crypto|stream|buffer|util|url|querystring|events|assert|process|child_process|cluster|dgram|dns|domain|http|https|net|os|readline|repl|string_decoder|tls|tty|v8|vm|zlib|worker_threads|perf_hooks)(\/.*)?$/,
        },
        (args) => {
          // Only add node: prefix if not already present
          if (!args.path.startsWith("node:")) {
            return {
              path: `node:${args.path}`,
              external: true,
            };
          }
          return {
            path: args.path,
            external: true,
          };
        },
      );

      // Already prefixed imports should just be marked as external
      build.onResolve({ filter: /^node:/ }, (args) => {
        return {
          path: args.path,
          external: true,
        };
      });
    },
  };

  const bundled = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: "neutral", // Use neutral platform for Deno/Edge Runtime
    target: "es2022",
    format: "esm",
    write: false,
    minify: true,
    plugins: [nodeCompatPlugin],
    // Define process.env as a global for compatibility
    define: {
      "process.env": "process.env",
      "global.process.env": "process.env",
    },
    // Inject a shim for process if needed
    banner: {
      js: `import process from "node:process";
globalThis.process = process;
`,
    },
  });

  if (!bundled.outputFiles || bundled.outputFiles.length === 0) {
    throw new Error(`No output generated for route ${route.urlPath}`);
  }

  return bundled.outputFiles[0].text;
}

async function createDeploymentArchive(
  artifactsDir: string,
  uuid: string,
  appFiles: string[],
  routes: Route[],
  distPath: string,
  apiPath: string | null,
  logger: Logger,
): Promise<BundleResult> {
  // Bundle API routes first (before creating the Promise)
  const bundledRoutes: Array<{ code: string; route: Route }> = [];
  if (apiPath && routes.length > 0) {
    for (const route of routes) {
      try {
        const bundledCode = await bundleApiRoute(apiPath, route, logger);
        bundledRoutes.push({ code: bundledCode, route });
      } catch (error) {
        logger.error(`Failed to bundle route ${route.urlPath}: ${error}`);
        throw error;
      }
    }
  }

  return new Promise((resolve, reject) => {
    const zipPath = join(artifactsDir, `${uuid}.zip`);
    const output = createWriteStream(zipPath);
    const archive = archiver("zip");

    output.on("close", () => {
      resolve({
        path: zipPath,
        size: archive.pointer(),
      });
    });

    archive.on("error", (err) => reject(err));
    archive.pipe(output);

    // Add app files to zip
    for (const file of appFiles) {
      const fullPath = join(distPath, file);
      archive.file(fullPath, { name: join("app", file) });
    }

    // Add bundled API routes to zip
    for (const { code, route } of bundledRoutes) {
      archive.append(code, {
        name: join("api", route.functionPath),
      });
    }

    archive.finalize();
  });
}

async function detectApiRoutes(
  apiPath: string,
  logger: Logger,
): Promise<Route[]> {
  const routes: Route[] = [];

  if (!existsSync(apiPath)) {
    await logger.info("No /api directory found, skipping API route detection");
    return routes;
  }

  await logger.info("Detecting API routes...");

  async function scanDirectory(dir: string, basePath = ""): Promise<void> {
    const items = await readdir(dir);

    for (const item of items) {
      const itemPath = join(dir, item);
      const stats = await stat(itemPath);

      if (stats.isDirectory()) {
        // Recursively scan subdirectories
        await scanDirectory(itemPath, join(basePath, item));
      } else if (stats.isFile()) {
        // Check if it's a valid API file
        if (
          item.match(/\.(js|ts|jsx|tsx|mjs)$/) &&
          !item.includes(".test.") &&
          !item.includes(".spec.")
        ) {
          // Remove file extension to get the route path
          const routeName = item.replace(/\.(js|ts|jsx|tsx|mjs)$/, "");
          const urlPath = join(
            "/api",
            basePath,
            routeName === "index" ? "" : routeName,
          ).replace(/\\/g, "/"); // Ensure forward slashes for URLs

          const functionPath = join(basePath, item).replace(/\\/g, "/");

          routes.push({
            urlPath,
            functionPath,
          });

          await logger.info(`Found API route: ${urlPath} -> ${functionPath}`);
        }
      }
    }
  }

  await scanDirectory(apiPath);

  await logger.info(`Detected ${routes.length} API routes`);
  return routes;
}

export async function createDeployment(
  buildId: string,
  buildDir: string,
  logger: Logger,
  track?: string,
) {
  // Ensure artifacts directory exists
  const artifactsDir = join("/app", ".origan", "artifacts");
  if (!existsSync(artifactsDir)) {
    mkdirSync(artifactsDir, { recursive: true });
  }

  await logger.info("Creating deployment package...");

  // List files in the build directory
  const appFiles = await listdirPath(buildDir);

  // Detect and bundle API routes
  const apiPath = join(process.cwd(), "api");
  const apiRoutes = await detectApiRoutes(apiPath, logger);

  // Create deployment config
  const config: DeployConfig = {
    app: appFiles,
    api: apiRoutes,
  };

  // Create archive
  const bundle = await createDeploymentArchive(
    artifactsDir,
    buildId,
    config.app,
    config.api,
    buildDir,
    existsSync(apiPath) ? apiPath : null,
    logger,
  );

  await logger.info("Uploading deployment...");

  const bundleBuffer = readFileSync(bundle.path);
  const bundleFile = new File([bundleBuffer], "bundle.zip", {
    type: "application/zip",
  });

  // Create FormData for tRPC
  const formData = new FormData();
  formData.append("buildId", buildId);
  formData.append("config", JSON.stringify(config));
  formData.append("artifact", bundleFile);
  if (track) {
    formData.append("track", track);
  }

  // Note : maybe this would be better architected by uploading to s3
  // And signaling to control that a build is ready to deploy (through NATS)
  try {
    const result = await controlApiClient.builds.deploy.mutate(formData);
    return result;
  } catch (error) {
    throw new Error(
      `Deploy to control API failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

export {
  bundleApiRoute,
  createDeploymentArchive,
  type Route,
  type BundleResult,
  type DeployConfig,
};
