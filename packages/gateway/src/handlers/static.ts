import { IncomingMessage, ServerResponse } from "node:http";
import { createGzip } from "node:zlib";
import { Config } from "../types/config.js";
import { getContentType } from "../utils/content-type.js";
import { fetchFromS3 } from "../utils/s3.js";
export async function handleStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  config: Config,
  deploymentId: string,
) {
  // Static file handling
  const requestedFile = path.slice(1); // Remove leading slash

  // 1. Check if the exact file exists in config
  if (config.app.includes(requestedFile)) {
    const buffer = await fetchFromS3(
      `deployments/${deploymentId}/app/${requestedFile}`,
    );
    if (buffer) {
      const contentType = getContentType(requestedFile);
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
  }

  // 2. Check if <path>/index.html exists
  const indexPath = path.endsWith("/")
    ? `${path}index.html`.slice(1)
    : `${path}/index.html`.slice(1);
  if (config.app.includes(indexPath)) {
    const buffer = await fetchFromS3(
      `deployments/${deploymentId}/app/${indexPath}`,
    );
    if (buffer) {
      const contentType = "text/html";
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
  }

  // 3. Check for root index.html
  if (config.app.includes("index.html")) {
    const buffer = await fetchFromS3(
      `deployments/${deploymentId}/app/index.html`,
    );
    if (buffer) {
      const contentType = "text/html";
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
  }

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
