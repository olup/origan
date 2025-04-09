import { createWriteStream } from "node:fs";
import { join, relative } from "node:path";
import archiver from "archiver";
import * as esbuild from "esbuild";
import type { Route } from "./path.js";

export interface BundleResult {
  path: string;
  size: number;
}

export async function bundleApiRoute(route: Route): Promise<string> {
  const bundled = await esbuild.build({
    entryPoints: [route.filePath],
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

export async function createDeploymentArchive(
  artifactsDir: string,
  uuid: string,
  appFiles: string[],
  routes: Route[],
  distPath: string,
  buildPath: string,
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
      const relativePath = relative(distPath, file);
      archive.file(file, { name: join("app", relativePath) });
    }

    // Add routes to zip
    for (const route of routes) {
      archive.file(route.filePath, { name: join("api", route.bundlePath) });
    }

    archive.finalize();
  });
}
