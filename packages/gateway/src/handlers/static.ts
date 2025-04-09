import { IncomingMessage, ServerResponse } from "node:http";
import { createGzip } from "node:zlib";
import { LRUCache } from "lru-cache";
import { Config } from "../types/config.js";
import { getContentType } from "../utils/content-type.js";
import { fetchFromS3 } from "../utils/s3.js";

// Cache static files with a max of 500MB
const staticFileCache = new LRUCache<string, Buffer>({
  maxSize: 500 * 1024 * 1024, // 500MB
  sizeCalculation: (value) => value.length,
});

export async function handleStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  config: Config,
  deploymentId: string
) {
  const requestedFile = path.slice(1); // Remove leading slash

  const served = await tryServeFile(
    req,
    res,
    requestedFile,
    undefined,
    config,
    deploymentId
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
    deploymentId
  );

  if (servedIndex) return true;

  const servedRoot = await tryServeFile(
    req,
    res,
    "index.html",
    "text/html",
    config,
    deploymentId
  );

  if (servedRoot) return true;

  // Not found
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      error: "Not found",
      path,
      app: config.app,
    })
  );
  return true;
}

async function tryServeFile(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string,
  contentTypeOverride: string | undefined,
  config: Config,
  deploymentId: string
): Promise<boolean> {
  if (!config.app.includes(filePath)) {
    return false;
  }

  const cacheKey = `${deploymentId}:${filePath}`;
  let buffer: Buffer | undefined = staticFileCache.get(cacheKey);

  if (!buffer) {
    const fetchedBuffer = await fetchFromS3(
      `deployments/${deploymentId}/app/${filePath}`
    );

    if (!fetchedBuffer) {
      return false;
    }

    buffer = fetchedBuffer;
    // Cache the file content since deployments are immutable
    staticFileCache.set(cacheKey, fetchedBuffer);
  }

  const contentType = contentTypeOverride ?? getContentType(filePath);

  const acceptEncoding = req.headers["accept-encoding"] || "";
  const shouldGzip =
    acceptEncoding.includes("gzip") &&
    /^(text\/|application\/(javascript|json))/i.test(contentType);

  if (shouldGzip) {
    const gzipped = createGzip();
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Encoding": "gzip",
    });
    gzipped.pipe(res);
    gzipped.end(buffer);
  } else {
    res.writeHead(200, { "Content-Type": contentType });
    res.end(buffer);
  }

  return true;
}
