import { basename, dirname, join, relative } from "path";

export interface Route {
  filePath: string;
  urlPath: string;
  bundlePath: string;
}

export interface RouteConfig {
  url: string;
  file: string;
}

export function normalizeApiPath(path: string): string {
  // Remove .ts extension
  let normalized = path.replace(/\.ts$/, "");
  // Convert Windows paths to URL paths
  normalized = normalized.replace(/\\/g, "/");
  // Ensure starts with /
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  // Remove trailing /index
  normalized = normalized.replace(/\/index$/, "");
  // Ensure root path is /
  if (normalized === "") {
    normalized = "/";
  }
  return normalized;
}

export function generateRouteBundlePath(urlPath: string): string {
  const routeId =
    urlPath === "/" ? "root" : urlPath.slice(1).replace(/\//g, "_");
  return join("routes", `${routeId}.js`);
}

export function resolveAppFiles(
  appFiles: string[],
  distPath: string,
): string[] {
  return appFiles.map((f) =>
    join("app", relative(join(process.cwd(), "dist"), f)),
  );
}

export function createRouteFromFile(apiDir: string, filePath: string): Route {
  const relPath = relative(apiDir, filePath);
  const urlPath = normalizeApiPath(
    basename(filePath) === "index.ts" ? dirname(relPath) : relPath,
  );
  const bundlePath = generateRouteBundlePath(urlPath);

  return {
    filePath,
    urlPath,
    bundlePath,
  };
}
