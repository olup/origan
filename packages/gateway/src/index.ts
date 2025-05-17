import {
  type IncomingMessage,
  type ServerResponse,
  createServer,
} from "node:http";
import { envConfig } from "./config/index.js";
import { handleAcmeChallenge } from "./handlers/acme.js";
import { handleApiRoute } from "./handlers/api.js";
import { handleHealthCheck } from "./handlers/health.js";
import { handleStaticFile } from "./handlers/static.js";
import { createHttpsServer } from "./server/https.js";
import { getConfig } from "./services/configurations.js";
import { s3Client } from "./utils/s3.js";

// Create ACME challenge handler
const acmeHandler = handleAcmeChallenge(s3Client, envConfig.bucketName);

console.log("ACME challenge handler initialized");

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
    const domain = host.replace(envConfig.origanDeployDomain, "");

    console.log("Domain:", domain);

    const result = await getConfig(domain);

    if (!result) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({ error: "Domain configuration not found" })
      );
    }

    const { config, deploymentId, projectId } = result;
    const path = req.url || "/";

    // Handle API routes
    if (await handleApiRoute(req, res, path, config, deploymentId, projectId)) {
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
