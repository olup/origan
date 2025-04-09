import type { IncomingMessage, ServerResponse } from "node:http";
import { env } from "node:process";
import { envConfig } from "../config/index.js";
import type { Config } from "../types/config.js";

export async function handleApiRoute(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  config: Config,
  deploymentId: string,
) {
  const route = config.api.find((r) => path === r.urlPath);

  if (!route) {
    return false;
  }

  console.log("Route found:", route);
  console.log("Runner API URL:", envConfig.runnerUrl);

  try {
    // Convert IncomingMessage headers to Record<string, string>
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        headers.set(key, Array.isArray(value) ? value[0] : value);
      }
    }

    headers.set(
      "x-origan-function-path",
      `deployments/${deploymentId}/api/${route.functionPath}`,
    );

    // Get request body if needed
    let body: ArrayBuffer | undefined;

    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks);
    }

    const response = await fetch(`${envConfig.runnerUrl}${path}`, {
      method: req.method,
      headers,
      body,
    });

    // Forward response headers
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }

    res.removeHeader("Content-Encoding");
    res.removeHeader("Content-Length");

    res.writeHead(response.status);
    res.end(Buffer.from(await response.arrayBuffer()));
    return true;
  } catch (error) {
    console.error("Error calling runner API:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
    return true;
  }
}
