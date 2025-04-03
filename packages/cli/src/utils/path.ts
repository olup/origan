import { basename, dirname, join, relative } from "path";

export interface Route {
  filePath: string;
  urlPath: string;
  bundlePath: string;
}

export interface RouteConfig {
  urlPath: string;
  functionPath: string;
}

export function normalizeApiPath(path: string): string {
  // Remove .ts extension
  let normalized = path.replace(/\.ts$/, "");
  // Convert Windows paths to URL paths
  normalized = normalized.replace(/\\/g, "/");
  // Remove trailing /index
  normalized = normalized.replace(/\/index$/, "");
  // Ensure root path is /
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  // Add /api prefix (avoiding double slash)
  if (normalized === "/") {
    normalized = "/api";
  } else {
    normalized = `/api${normalized}`;
  }
  return normalized;
}

export function resolveAppFiles(
  appFiles: string[],
  distPath: string,
): string[] {
  return appFiles.map((f) =>
    join("app", relative(join(process.cwd(), distPath), f)),
  );
}

export function createRouteFromFile(apiDir: string, filePath: string): Route {
  const relPath = relative(apiDir, filePath);
  const isIndex = basename(filePath) === "index.ts";

  // If it's an index file, use the directory name, otherwise remove .ts extension
  const pathForNormalization = isIndex
    ? dirname(relPath)
    : relPath.replace(/\.ts$/, "");

  const urlPath = normalizeApiPath(pathForNormalization);

  return {
    filePath,
    urlPath,
    bundlePath: relPath.replace(/\.ts$/, ".js"),
  };
}
