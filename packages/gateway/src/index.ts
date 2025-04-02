import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const CONTROL_API_URL = process.env.CONTROL_API_URL || "http://localhost:9999";
const ORIGAN_DOMAIN = process.env.ORIGAN_DOMAIN;

if (!ORIGAN_DOMAIN) {
  throw new Error("ORIGAN_DOMAIN environment variable is required");
}

interface RouteConfig {
  url: string;
  file: string;
}

interface Config {
  app: string[];
  routes: RouteConfig[];
  domain_placeholder?: string;
}

// Initialize S3 client
const s3Client = new S3Client({
  endpoint: process.env.BUCKET_URL,
  region: "us-east-1", // MinIO default region
  forcePathStyle: true, // Required for MinIO
  credentials: {
    accessKeyId: process.env.BUCKET_ACCESS_KEY || "",
    secretAccessKey: process.env.BUCKET_SECRET_KEY || "",
  },
});

const BUCKET_NAME = process.env.BUCKET_NAME || "deployment-bucket";

const app = new Hono();

// const configCache = new Map<
//   string,
//   { config: Config; timestamp: number; deploymentId: string }
// >();
// const CONFIG_CACHE_TTL = 60000; // 1 minute cache

async function getConfig(
  domain: string
): Promise<{ config: Config; deploymentId: string } | null> {
  // Return cached config if still valid
  // const cached = configCache.get(domain);
  // if (cached && Date.now() - cached.timestamp < CONFIG_CACHE_TTL) {
  //   return { config: cached.config, deploymentId: cached.deploymentId };
  // }

  try {
    const response = await fetch(`${CONTROL_API_URL}/api/getConfig`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ domain }),
    });

    if (!response.ok) {
      console.error("Failed to fetch config:", await response.text());
      return null;
    }

    const { config, deploymentId } = await response.json();
    // configCache.set(domain, {
    //   config,
    //   deploymentId,
    //   timestamp: Date.now(),
    // });
    return { config, deploymentId };
  } catch (error) {
    console.error("Error fetching config:", error);
    return null;
  }
}

// Helper to determine content type based on file extension
function getContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const types: { [key: string]: string } = {
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    ico: "image/x-icon",
  };

  return types[ext || ""] || "application/octet-stream";
}

// Health check endpoint
app.get("/health", (c) => c.json({ status: "ok" }));

// Main proxy route
app.all("*", async (c) => {
  // Extract domain from request
  const host = c.req.header("host");
  if (!host) {
    return c.json({ error: "No host header found" }, 400);
  }

  // Remove port if present
  // replace ORIGAN_DOMAIN with origan.main as it is saved with a placeholder in database
  const domain = host.split(":")[0].replace(ORIGAN_DOMAIN, "origan.main");

  console.log("Domain:", domain);

  const result = await getConfig(domain);
  if (!result) {
    return c.json({ error: "Failed to get domain configuration" }, 500);
  }

  console.log("Config:", result);

  const { config, deploymentId } = result;
  const path = c.req.path;

  // Check if this is an API route
  if (path.startsWith("/api/")) {
    // Handle API routes differently
    return c.json({ error: "API routes not implemented" }, 501);
  }

  // Function to fetch file from S3
  async function fetchFromS3(key: string) {
    try {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });

      const response = await s3Client.send(command);
      if (!response.Body) {
        throw new Error("No response body");
      }

      // Convert Readable to Buffer
      const chunks: Buffer[] = [];
      for await (const chunk of response.Body as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      console.error("Error fetching file from S3:", error);
      return null;
    }
  }

  // 1. Check if the exact file exists in config
  const requestedFile = path.slice(1); // Remove leading slash
  if (config.app.includes(requestedFile)) {
    const buffer = await fetchFromS3(
      `deployments/${deploymentId}/app/${requestedFile}`
    );
    if (buffer) {
      c.header("Content-Type", getContentType(requestedFile));
      return c.body(buffer);
    }
  }

  // 2. Check if <path>/index.html exists
  const indexPath = path.endsWith("/")
    ? `${path}index.html`.slice(1)
    : `${path}/index.html`.slice(1);
  if (config.app.includes(indexPath)) {
    const buffer = await fetchFromS3(
      `deployments/${deploymentId}/app/${indexPath}`
    );
    if (buffer) {
      c.header("Content-Type", "text/html");
      return c.body(buffer);
    }
  }

  // 3. Check for root index.html
  if (config.app.includes("index.html")) {
    const buffer = await fetchFromS3(
      `deployments/${deploymentId}/app/index.html`
    );
    if (buffer) {
      c.header("Content-Type", "text/html");
      return c.body(buffer);
    }
  }

  return c.json(
    {
      error: "Not found",
      path,
      app: config.app,
    },
    404
  );
});

const port = process.env.PORT || 7777;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port: Number(port),
});
