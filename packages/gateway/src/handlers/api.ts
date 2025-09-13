import type { IncomingMessage, ServerResponse } from "node:http";
import { envConfig } from "../config/index.js";
import type { Config } from "../types/config.js";

const STREAM_TIMEOUT_MS = 10000; // 10 seconds max for all streaming connections

export async function handleApiRoute(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  config: Config,
  deploymentId: string,
  projectId: string,
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
    headers.set("x-origan-deployment-id", deploymentId);
    headers.set("x-origan-project-id", projectId);

    // Get request body if needed
    let body: Buffer<ArrayBuffer> | undefined;

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

    // Check if response has a streamable body
    if (response.body) {
      console.log("Streaming response detected, starting stream");

      // Forward all response headers except those Node.js manages
      const responseHeaders: Record<string, string> = {};
      for (const [key, value] of response.headers.entries()) {
        const lowerKey = key.toLowerCase();
        // Skip headers that Node.js handles automatically
        if (
          lowerKey !== "content-encoding" &&
          lowerKey !== "transfer-encoding"
        ) {
          responseHeaders[key] = value;
        }
      }

      // Add streaming optimization headers
      responseHeaders["X-Accel-Buffering"] = "no"; // Disable nginx buffering

      res.writeHead(response.status, responseHeaders);

      // Set up timeout for streaming
      const timeoutId = setTimeout(() => {
        console.log(
          `Stream timeout reached (${STREAM_TIMEOUT_MS}ms), closing stream`,
        );
        res.end();
      }, STREAM_TIMEOUT_MS);

      // Handle client disconnect
      req.on("close", () => {
        console.log("Client disconnected from stream");
        clearTimeout(timeoutId);
      });

      try {
        // Stream the response as binary data
        const reader = response.body.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log("Stream completed");
            break;
          }

          // Handle as binary data - works for both text and binary streams
          const buffer = Buffer.from(value);

          // Write chunk to response with backpressure handling
          if (!res.write(buffer)) {
            // Wait for drain event if buffer is full
            await new Promise((resolve) => res.once("drain", resolve));
          }
        }
      } catch (streamError) {
        console.error("Error during streaming:", streamError);
      } finally {
        clearTimeout(timeoutId);
        res.end();
      }
    } else {
      // Non-streaming response (fallback for responses without body)
      // Forward response headers
      for (const [key, value] of response.headers.entries()) {
        res.setHeader(key, value);
      }

      res.removeHeader("Content-Encoding");
      res.removeHeader("Content-Length");

      res.writeHead(response.status);
      res.end(Buffer.from(await response.arrayBuffer()));
    }

    return true;
  } catch (error) {
    console.error("Error calling runner API:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
    return true;
  }
}
