import { GetObjectCommand, S3Client } from "npm:@aws-sdk/client-s3";
import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import { startCleanupInterval } from "./cleanup.ts";
import type { EdgeRuntime } from "./edge-runtime.ts";

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
startCleanupInterval("functions/workers");

serve(async (req: Request) => {
  // const get function path on s3 from header
  const headers = req.headers;
  const functionPath = headers.get("x-origan-function-path");
  if (!functionPath) {
    return new Response("Function path not provided", { status: 400 });
  }
  const startTime = performance.now();

  console.log("Request received:", req, functionPath);

  // sha1 of path
  const queryHash = await sha1(functionPath);
  const workerPath = `functions/workers/${queryHash}`;

  const memoryLimitMb = 150;
  const workerTimeoutMs = 1 * 60 * 1000;
  const noModuleCache = false;
  const importMapPath = null;
  const envVars = Object.entries(envVarsObj) as [string, string][];

  console.error(`serving the request for ${functionPath}`);

  try {
    await Deno.mkdir(workerPath, { recursive: true });

    const fileContent = await getObject(envVarsObj.BUCKET_NAME, functionPath);

    if (!fileContent) {
      throw new Error("Failed to get file content from S3");
    }

    await Deno.writeTextFile(`${workerPath}/index.ts`, fileContent, {
      create: true,
    });
  } catch (error) {
    console.error("Error fetching from S3:", error);
    return new Response(
      JSON.stringify({ msg: "Failed to fetch function from S3" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  console.log(`Worker path: ${workerPath}`);

  try {
    // @ts-expect-error Deno is not aware of the EdgeRuntime type
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: workerPath,
      memoryLimitMb,
      workerTimeoutMs,
      noModuleCache,
      importMapPath,
      envVars,
    });

    console.log("Worker created successfully");

    const newReq = new Request(req);

    // We should not need that anymore as we are copying the request
    // EdgeRuntime.applySupabaseTag(req, newReq);

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
