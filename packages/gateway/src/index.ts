import { IncomingMessage, ServerResponse, createServer } from "node:http";
import { envConfig } from "./config/index.js";
import { handleAcmeChallenge } from "./handlers/acme.js";
import { handleApiRoute } from "./handlers/api.js";
import { handleHealthCheck } from "./handlers/health.js";
import { handleStaticFile } from "./handlers/static.js";
import { client } from "./libs/client.js";
import { createHttpsServer } from "./server/https.js";
import { Config } from "./types/config.js";
import { s3Client } from "./utils/s3.js";

async function getConfig(
  domain: string,
): Promise<{ config: Config; deploymentId: string } | null> {
  try {
    const response = await client.deployments["get-config"].$post({
      json: {
        domain,
      },
    });

    const data = await response.json();

    if ("error" in data) {
      console.error("Error fetching config:", data.error);
      return null;
    }

    const { config, deploymentId } = data;
    return { config, deploymentId };
  } catch (error) {
    console.error("Error fetching config:", error);
    return null;
  }
}

// Create ACME challenge handler
const acmeHandler = handleAcmeChallenge(s3Client, envConfig.bucketName);

// Main request handler
async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  try {
    // Health check
    if (await handleHealthCheck(req, res)) {
      return;
    }

    // ACME challenge
    if (await acmeHandler(req, res)) {
      return;
    }

    // Extract domain from request
    const host = req.headers.host;
    if (!host) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "No host header found" }));
    }

    // Remove port if present and replace domain
    const domain = host
      .split(":")[0]
      .replace(envConfig.origanDomain, "origan.main");

    console.log("Domain:", domain);

    const result = await getConfig(domain);
    if (!result) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({ error: "Failed to get domain configuration" }),
      );
    }

    console.log("Config:", result);

    const { config, deploymentId } = result;
    const path = req.url || "/";

    // Handle API routes
    if (await handleApiRoute(req, res, path, config, deploymentId)) {
      return;
    }

    // Handle static files
    await handleStaticFile(req, res, path, config, deploymentId);
  } catch (error) {
    console.error("Error handling request:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

// Start HTTP server
const httpServer = createServer(handleRequest);
httpServer.listen(7777, () => console.log("HTTP Server is running on 7777"));

if (envConfig.hasTlsServer) {
  // Start HTTPS server with dynamic certificate loading via SNI
  createHttpsServer(handleRequest);
}
