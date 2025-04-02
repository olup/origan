import { createHash } from "crypto";
import { createReadStream } from "fs";
import { join, relative } from "path";
import { Transform } from "stream";
import * as esbuild from "esbuild";
import { stat } from "fs/promises";
import { API_URL } from "../constants.js";
import {
  collectFiles,
  createDirectories,
  validateDirectory,
  writeConfig,
} from "../utils/file.js";
import type { Route, RouteConfig } from "../utils/path.js";
import { createRouteFromFile, normalizeApiPath } from "../utils/path.js";
import { bundleApiRoute, createDeploymentArchive } from "../utils/zip.js";

interface ConfigJson {
  files: string[];
  routes: RouteConfig[];
}

function generateConfig(appFiles: string[], routes: Route[]): ConfigJson {
  return {
    files: appFiles.map((f) => join(relative(join(process.cwd(), "dist"), f))),
    routes: routes.map((route) => ({
      url: route.urlPath,
      file: route.bundlePath,
    })),
  };
}

function generateUUID(): string {
  return crypto.randomUUID();
}

async function uploadArchive(
  archivePath: string,
  projectRef: string,
  branch: string,
  config: ConfigJson,
): Promise<void> {
  const stats = await stat(archivePath);
  const totalSize = stats.size;
  let uploaded = 0;

  // Create a transform stream to track progress
  const progressStream = new Transform({
    transform(chunk, encoding, callback) {
      uploaded += chunk.length;
      const percentage = Math.round((uploaded / totalSize) * 100);
      process.stdout.write(`\rUploading: ${percentage}%`);
      callback(null, chunk);
    },
  });

  // Create form data boundary
  const boundary = `--------------------------${Date.now().toString(16)}`;

  // Create archive stream through progress tracker
  const archiveStream = createReadStream(archivePath).pipe(progressStream);

  // Create multipart form-data payload
  const boundaryLine = `--${boundary}\r\n`;
  const contentDispositionBundle =
    'Content-Disposition: form-data; name="bundle"; filename="bundle.zip"\r\n';
  const contentTypeBundle = "Content-Type: application/zip\r\n\r\n";
  const contentDispositionConfig =
    'Content-Disposition: form-data; name="config"\r\n';
  const contentTypeConfig = "Content-Type: application/json\r\n\r\n";
  const contentDispositionProjectRef =
    'Content-Disposition: form-data; name="projectRef"\r\n';
  const contentDispositionBranchRef =
    'Content-Disposition: form-data; name="branchRef"\r\n';
  const endBoundary = `\r\n--${boundary}--\r\n`;

  // Convert archive to buffer
  const archiveBuffer = await streamToBuffer(archiveStream);

  // Build form parts as Buffer instances
  const parts: Buffer[] = [
    Buffer.from(boundaryLine, "utf-8"),
    Buffer.from(contentDispositionBundle, "utf-8"),
    Buffer.from(contentTypeBundle, "utf-8"),
    archiveBuffer,
    Buffer.from(`\r\n${boundaryLine}`, "utf-8"),
    Buffer.from(contentDispositionProjectRef, "utf-8"),
    Buffer.from("\r\n", "utf-8"),
    Buffer.from(projectRef, "utf-8"),
    Buffer.from(`\r\n${boundaryLine}`, "utf-8"),
    Buffer.from(contentDispositionBranchRef, "utf-8"),
    Buffer.from("\r\n", "utf-8"),
    Buffer.from(branch, "utf-8"),
    Buffer.from(`\r\n${boundaryLine}`, "utf-8"),
    Buffer.from(contentDispositionConfig, "utf-8"),
    Buffer.from(contentTypeConfig, "utf-8"),
    Buffer.from(JSON.stringify(config), "utf-8"),
    Buffer.from(endBoundary, "utf-8"),
  ];

  // Concatenate all parts into final form data
  const form = Buffer.concat(parts);

  // Upload with progress tracking
  const response = await fetch(`${API_URL}/api/deploy`, {
    method: "POST",
    body: form,
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  // Clear progress line and move to next line
  process.stdout.write("\n");
}

// Helper to convert stream to buffer
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    const chunks: any[] = [];

    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

export async function deploy(
  projectRef: string,
  branch = "main",
): Promise<void> {
  try {
    console.log("Starting deployment process...");

    // Create required directories
    const artifactsDir = join(process.cwd(), ".origan", "artifacts");
    const buildDir = join(process.cwd(), ".origan", "build");

    console.log("Creating build directories...");
    createDirectories([artifactsDir, buildDir, join(buildDir, "routes")]);

    // Discover and validate directories
    const apiDir = join(process.cwd(), "api");
    const distPath = join(process.cwd(), "dist");

    if (!validateDirectory(distPath)) {
      throw new Error(
        "dist/ directory not found. Please build your application first.",
      );
    }

    // Discover API routes if api directory exists
    let routes: Route[] = [];
    if (validateDirectory(apiDir)) {
      console.log("Discovering API routes...");
      const apiFiles = collectFiles(apiDir).filter(
        (file) => file.endsWith(".ts") && !file.includes("/_"),
      );

      routes = apiFiles
        .map((file) => createRouteFromFile(apiDir, file))
        .sort((a, b) => a.urlPath.length - b.urlPath.length);

      console.log(`Found ${routes.length} API routes`);
    } else {
      console.log("No api/ directory found, skipping API routes");
    }

    // Collect and validate app files
    console.log("\nProcessing application files...");
    const appFiles = collectFiles(distPath);

    if (appFiles.length === 0) {
      throw new Error(
        "No files found in dist/ directory. Please build your application first.",
      );
    }
    console.log(`Found ${appFiles.length} app files`);

    // Generate config
    console.log("Generating deployment configuration...");
    const config = generateConfig(appFiles, routes);
    const configPath = writeConfig(
      buildDir,
      config as unknown as Record<string, unknown>,
    );
    console.log("Configuration file generated");

    // Bundle routes
    if (routes.length > 0) {
      console.log("\nProcessing API routes:");
      for (const route of routes) {
        try {
          process.stdout.write(`  ${route.urlPath} -> ${route.bundlePath}...`);
          await bundleApiRoute(route);
          console.log(" ✓");
        } catch (error) {
          console.log(" ✗");
          if (error instanceof Error) {
            console.error(
              `  Error bundling ${route.urlPath}: ${error.message}`,
            );
          }
          throw new Error(
            `Failed to bundle route ${route.urlPath} (${route.filePath})`,
          );
        }
      }
      console.log("\nAPI routes processing complete");
    }

    const uuid = generateUUID();
    const bundle = await createDeploymentArchive(
      artifactsDir,
      uuid,
      appFiles,
      routes,
      distPath,
      configPath,
    );

    console.log("\nDeployment Summary:");
    console.log("------------------");
    console.log(`App Files: ${appFiles.length}`);
    console.log(`API Routes: ${routes.length}`);
    console.log(`Artifact: ${bundle.path}`);
    console.log(`Size: ${(bundle.size / 1024).toFixed(2)} KB`);

    console.log("\nUploading deployment package...");
    await uploadArchive(bundle.path, projectRef, branch, config);
    console.log("Deployment uploaded successfully! ✨");
  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}
