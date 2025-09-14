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
  const requestedFile = path.slice(1); // Remove leading slash

  const served = await tryServeFile(
    req,
    res,
    requestedFile,
    undefined,
    config,
    deploymentId,
  );

  if (served) return true;

  const indexPath = path.endsWith("/")
    ? `${path}index.html`.slice(1)
    : `${path}/index.html`.slice(1);

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
    "index.html",
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
      app: config.app,
    }),
  );
  return true;
}

async function tryServeFile(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string,
  contentTypeOverride: string | undefined,
  config: Config,
  deploymentId: string,
): Promise<boolean> {
  if (!config.app.includes(filePath)) {
    return false;
  }

  const s3Response = await streamFromS3(
    `deployments/${deploymentId}/app/${filePath}`,
  );

  if (!s3Response) {
    return false;
  }

  const contentType = contentTypeOverride ?? getContentType(filePath);

  const acceptEncoding = req.headers["accept-encoding"] || "";
  const shouldGzip =
    acceptEncoding.includes("gzip") &&
    /^(text\/|application\/(javascript|json))/i.test(contentType);

  const headers: Record<string, string> = {
    "Content-Type": contentType,
  };

  // Add cache headers
  if (s3Response.etag) {
    headers.ETag = s3Response.etag;
  }
  if (s3Response.lastModified) {
    headers["Last-Modified"] = s3Response.lastModified.toUTCString();
  }
  // Cache for 1 hour for immutable deployments
  headers["Cache-Control"] = "public, max-age=3600";

  if (shouldGzip) {
    headers["Content-Encoding"] = "gzip";
    res.writeHead(200, headers);
    const gzipped = createGzip();
    await pipeline(s3Response.stream, gzipped, res);
  } else {
    if (s3Response.contentLength) {
      headers["Content-Length"] = s3Response.contentLength.toString();
    }
    res.writeHead(200, headers);
    await pipeline(s3Response.stream, res);
  }

  return true;
}
