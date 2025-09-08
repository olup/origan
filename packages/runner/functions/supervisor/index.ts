import { resolve } from "https://deno.land/std/path/mod.ts";
import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import { GetObjectCommand, S3Client } from "npm:@aws-sdk/client-s3";
import { startCleanupInterval } from "./cleanup.ts";

const envVarsObj = Deno.env.toObject();

async function sha1(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);

  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hashHex;
}

const s3Client = new S3Client({
  endpoint: envVarsObj.BUCKET_URL,
  region: envVarsObj.BUCKET_REGION || "us-east-1", // Use configured region or default to MinIO's default
  forcePathStyle: true, // Required for MinIO
  credentials: {
    accessKeyId: envVarsObj.BUCKET_ACCESS_KEY || "",
    secretAccessKey: envVarsObj.BUCKET_SECRET_KEY || "",
  },
});

const WORKERS_PATH = envVarsObj.WORKERS_PATH || "./.workers";
if (WORKERS_PATH == null) {
  throw new Error("WORKERS_PATH environment variable not set");
}

await Deno.mkdir(WORKERS_PATH, { recursive: true });

// Helper function to get object from S3
async function getObject(Bucket: string, Key: string): Promise<string> {
  console.log(`Fetching ${Key} from S3 bucket ${Bucket}`);

  const s3StartTime = performance.now();
  const getObjectCommand = new GetObjectCommand({ Bucket, Key });
  const response = await s3Client.send(getObjectCommand);
  const s3Duration = performance.now() - s3StartTime;
  console.log(`S3 fetch for ${Key} completed in ${s3Duration.toFixed(2)}ms`);

  if (!response.Body) {
    throw new Error("Empty response from S3");
  }

  // Convert to ArrayBuffer and then to string
  const body = response.Body as unknown as {
    transformToByteArray(): Promise<Uint8Array>;
  };
  const bytes = await body.transformToByteArray();
  return new TextDecoder().decode(bytes);
}

console.log("main function started");

// Start the cleanup interval for worker directories
startCleanupInterval(WORKERS_PATH);

serve(async (req: Request) => {
  // const get function path on s3 from header
  const headers = req.headers;
  const functionPath = headers.get("x-origan-function-path");
  if (!functionPath) {
    console.error("Function path not provided in headers");
    return new Response("Function path not provided", { status: 400 });
  }
  const deploymentId = headers.get("x-origan-deployment-id");
  const projectId = headers.get("x-origan-project-id");
  const startTime = performance.now();

  // sha1 of path
  const queryHash = await sha1(functionPath);
  const workerPath = resolve(
    `${WORKERS_PATH}/${projectId}/${deploymentId}/${queryHash}`,
  );

  const memoryLimitMb = 150;
  const workerTimeoutMs = 1 * 60 * 1000;
  const noModuleCache = false;
  let envVars = Object.entries(envVarsObj) as [string, string][];

  console.error(`serving the request for ${functionPath}`);

  try {
    await Deno.mkdir(workerPath, { recursive: true });

    const fileContent = await getObject(envVarsObj.BUCKET_NAME, functionPath);

    if (!fileContent) {
      throw new Error("Failed to get file content from S3");
    }

    await Deno.writeTextFile(`${workerPath}/index.ts`, `${fileContent}`, {
      create: true,
    });

    // Fetch deployment metadata including environment variables
    if (deploymentId) {
      try {
        const metadataPath = `deployments/${deploymentId}/metadata.json`;
        const metadataContent = await getObject(
          envVarsObj.BUCKET_NAME,
          metadataPath,
        );

        if (metadataContent) {
          const metadata = JSON.parse(metadataContent);
          if (metadata.environmentVariables) {
            // Merge deployment environment variables with system env vars
            // Deployment vars take precedence
            const deploymentEnvVars = metadata.environmentVariables;
            const mergedEnvVars = {
              ...envVarsObj,
              ...deploymentEnvVars,
            };
            envVars = Object.entries(mergedEnvVars) as [string, string][];
            console.log(
              `Loaded ${
                Object.keys(deploymentEnvVars).length
              } environment variables from metadata`,
            );
          }
        }
      } catch (error) {
        console.warn(
          `Failed to load metadata for deployment ${deploymentId}:`,
          error,
        );
        // Continue with system env vars only
      }
    }
  } catch (error) {
    console.error("Error fetching from S3:", error);
    return new Response(
      JSON.stringify({ msg: "Failed to fetch function from S3" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  console.log(`Worker path: ${workerPath}`);

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: workerPath,
      memoryLimitMb,
      workerTimeoutMs,
      noModuleCache,
      envVars,
    });

    console.log("Worker created successfully");

    const newReq = new Request(req);

    // We should not need that anymore as we are copying the request
    EdgeRuntime.applySupabaseTag(req, newReq);

    const response = await worker.fetch(newReq);

    const duration = performance.now() - startTime;
    console.log(`Request execution completed in ${duration.toFixed(2)}ms`);

    return response;
  } catch (e: unknown) {
    const duration = performance.now() - startTime;
    const error = {
      msg: e instanceof Error ? e.message : "Unknown error occurred",
    };

    console.error(`Request failed after ${duration.toFixed(2)}ms:`, error.msg);

    return new Response(JSON.stringify(error), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
