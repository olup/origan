import type { IncomingMessage, ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import type { Config } from "../types/config.js";
import { getContentType } from "../utils/content-type.js";
import { streamFromS3 } from "../utils/s3.js";

export async function handleStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  config: Config,
  deploymentId: string,
) {
  const served = await tryServeFile(
    req,
    res,
    path,
    undefined,
    config,
    deploymentId,
  );

  if (served) return true;

  const indexPath = path.endsWith("/")
    ? `${path}index.html`
    : `${path}/index.html`;

  const servedIndex = await tryServeFile(
    req,
    res,
    indexPath,
    "text/html",
    config,
    deploymentId,
  );

  if (servedIndex) return true;

  const servedRoot = await tryServeFile(
    req,
    res,
    "/index.html",
    "text/html",
    config,
    deploymentId,
  );

  if (servedRoot) return true;

  // Not found
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      error: "Not found",
      path,
      resources: config.resources.length,
    }),
  );
  return true;
}

async function tryServeFile(
  req: IncomingMessage,
  res: ServerResponse,
  urlPath: string,
  contentTypeOverride: string | undefined,
  config: Config,
  deploymentId: string,
): Promise<boolean> {
  const resource = findStaticResource(config, urlPath);
  if (!resource) {
    return false;
  }

  const s3Response = await streamFromS3(
    `deployments/${deploymentId}/${resource.resourcePath}`,
  );

  if (!s3Response) {
    return false;
  }

  const contentType =
    contentTypeOverride ?? getContentType(resource.resourcePath);

  const acceptEncoding = req.headers["accept-encoding"] || "";
  const shouldGzip =
    acceptEncoding.includes("gzip") &&
    /^(text\/|application\/(javascript|json))/i.test(contentType);

  const headers = buildStaticHeaders({
    contentType,
    resourceHeaders: resource.headers,
    etag: s3Response.etag,
    lastModified: s3Response.lastModified,
    contentLength: s3Response.contentLength,
    shouldGzip,
  });

  if (shouldGzip) {
    res.writeHead(200, headers);
    const gzipped = createGzip();
    await pipeline(s3Response.stream, gzipped, res);
  } else {
    res.writeHead(200, headers);
    await pipeline(s3Response.stream, res);
  }

  return true;
}

export function findStaticResource(config: Config, urlPath: string) {
  const normalizedPath = normalizePath(urlPath);
  return (
    config.resources.find(
      (resource) =>
        resource.kind === "static" && resource.urlPath === normalizedPath,
    ) ?? null
  );
}

export function normalizePath(path: string) {
  if (!path.startsWith("/")) {
    return `/${path}`;
  }
  return path;
}

export function buildStaticHeaders({
  contentType,
  resourceHeaders,
  etag,
  lastModified,
  contentLength,
  shouldGzip,
}: {
  contentType: string;
  resourceHeaders?: Record<string, string>;
  etag?: string;
  lastModified?: Date;
  contentLength?: number | null;
  shouldGzip: boolean;
}) {
  const headers: Record<string, string> = {
    "Content-Type": contentType,
  };

  if (resourceHeaders) {
    for (const [key, value] of Object.entries(resourceHeaders)) {
      headers[key] = value;
    }
  }

  if (etag) {
    headers.ETag = etag;
  }
  if (lastModified) {
    headers["Last-Modified"] = lastModified.toUTCString();
  }

  const hasCacheControl = Object.keys(headers).some(
    (key) => key.toLowerCase() === "cache-control",
  );
  if (!hasCacheControl) {
    headers["Cache-Control"] = "public, max-age=3600";
  }

  if (shouldGzip) {
    headers["Content-Encoding"] = "gzip";
  } else if (contentLength) {
    headers["Content-Length"] = contentLength.toString();
  }

  return headers;
}
