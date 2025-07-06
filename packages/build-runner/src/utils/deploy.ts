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

const controlApiClient = createControlApiClient(getConfig().CONTROL_API_URL);

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

async function bundleApiRoute(route: Route): Promise<string> {
  const bundled = await esbuild.build({
    entryPoints: [route.functionPath],
    external: [],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    write: false,
    minify: true,
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
  _routes: Route[],
  distPath: string,
): Promise<BundleResult> {
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

    // TODO : Add API routes to zip

    archive.finalize();
  });
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

  // first, list the path of the files in the build directory using fs

  const appFiles = await listdirPath(buildDir);

  // Create deployment config
  const config: DeployConfig = {
    app: appFiles,
    api: [], // TODO bundle and list api files
  };

  // Create archive
  const bundle = await createDeploymentArchive(
    artifactsDir,
    buildId,
    config.app,
    config.api,
    buildDir,
  );

  await logger.info("Uploading deployment...");
  const formData = new FormData();
  formData.append("config", JSON.stringify(config));

  const bundleBuffer = readFileSync(bundle.path);
  const bundleFile = new File([bundleBuffer], "bundle.zip", {
    type: "application/zip",
  });

  // Note : maybe this would be better architected by uploading to s3
  // And signaling to control that a build is ready to deploy (through NATS)
  const response = await controlApiClient.builds[":buildId"].deploy.$post(
    {
      param: {
        buildId,
      },
      form: {
        config: JSON.stringify(config),
        artifact: bundleFile,
        ...(track ? { track } : {}),
      },
    },
    {
      headers: {
        Authorization: `Bearer ${getConfig().DEPLOY_TOKEN}`,
      },
    },
  );

  return response;
}

export {
  bundleApiRoute,
  createDeploymentArchive,
  type Route,
  type BundleResult,
  type DeployConfig,
};
