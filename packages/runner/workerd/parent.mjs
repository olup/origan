import { AwsClient } from "./aws4fetch.mjs";

const codeCache = new Map();
const metadataCache = new Map();

function buildNatsConnection(url) {
  const socket = new WebSocket(url);
  const state = {
    socket,
    ready: false,
    queue: [],
  };

  socket.addEventListener("open", () => {
    const connectPayload = JSON.stringify({
      verbose: false,
      pedantic: false,
      lang: "js",
      version: "1.0.0",
    });
    socket.send(`CONNECT ${connectPayload}\r\n`);
    state.ready = true;
    for (const message of state.queue) {
      socket.send(message);
    }
    state.queue = [];
  });

  socket.addEventListener("close", () => {
    state.ready = false;
  });

  return state;
}

async function getNatsConnection(env) {
  const url = env.EVENTS_NATS_WS_SERVER;
  if (!url) {
    return null;
  }
  const conn = await new Promise((resolve) => {
    const next = buildNatsConnection(url);
    next.socket.addEventListener("open", () => resolve(next));
    next.socket.addEventListener("error", () => resolve(null));
  });
  return conn;
}

async function publishNatsLog(env, subject, payload, conn) {
  const activeConn = conn || (await getNatsConnection(env));
  if (!activeConn) {
    return;
  }
  const message = `PUB ${subject} ${payload.length}\r\n${payload}\r\n`;
  if (activeConn.ready) {
    activeConn.socket.send(message);
  } else {
    activeConn.queue.push(message);
  }
}

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchS3Object(env, key) {
  const baseUrl = env.BUCKET_URL;
  const bucket = env.BUCKET_NAME;
  const region = env.BUCKET_REGION || "us-east-1";
  const accessKey = env.BUCKET_ACCESS_KEY;
  const secretKey = env.BUCKET_SECRET_KEY;

  if (!baseUrl || !bucket || !accessKey || !secretKey) {
    throw new Error("Missing S3 configuration for runner");
  }

  const trimmed = baseUrl.replace(/\/+$/, "");
  const objectUrl = new URL(`${trimmed}/${bucket}/${key}`);
  const client = new AwsClient({
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
    region,
    service: "s3",
  });
  const response = await client.fetch(objectUrl.toString(), { method: "GET" });

  const body = await response.text();
  if (!response.ok) {
    const requestId = response.headers.get("x-amz-request-id");
    const snippet = body.slice(0, 512);
    throw new Error(
      `Failed to fetch ${key} from bucket (status ${response.status})${requestId ? ` requestId=${requestId}` : ""}: ${snippet}`,
    );
  }

  return body;
}

async function loadMetadata(env, deploymentId) {
  const cached = metadataCache.get(deploymentId);
  if (cached) {
    return cached;
  }

  const metadataKey = `deployments/${deploymentId}/metadata.json`;
  const raw = await fetchS3Object(env, metadataKey);
  const parsed = JSON.parse(raw);
  const envVars = parsed?.environmentVariables || {};
  metadataCache.set(deploymentId, envVars);
  return envVars;
}

async function loadUserCode(env, functionPath) {
  const cached = codeCache.get(functionPath);
  if (cached) {
    return cached;
  }

  const code = await fetchS3Object(env, functionPath);
  codeCache.set(functionPath, code);
  return code;
}

async function sha1Hex(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const digest = await crypto.subtle.digest("SHA-1", data);
  return toHex(digest);
}

function buildWrapperModule(envVars, natsWsServer) {
  const envJson = JSON.stringify(envVars || {});
  const natsUrlJson = JSON.stringify(natsWsServer || "");
  return `
import { AsyncLocalStorage } from "node:async_hooks";

const __ORIGAN_ENV = ${envJson};
const __ORIGAN_NATS_WS_SERVER = ${natsUrlJson};
const __process = globalThis.process ?? {};
if (!__process.env) {
  __process.env = {};
}
Object.assign(__process.env, __ORIGAN_ENV);
globalThis.process = __process;

function __formatLogArgs(args) {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return arg.stack || arg.message;
      }
      if (typeof arg === "string") {
        return arg;
      }
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

const __logStorage = new AsyncLocalStorage();

function __buildNatsConnection(url) {
  const socket = new WebSocket(url);
  const state = {
    socket,
    ready: false,
    queue: [],
  };

  socket.addEventListener("open", () => {
    const connectPayload = JSON.stringify({
      verbose: false,
      pedantic: false,
      lang: "js",
      version: "1.0.0",
    });
    socket.send(\`CONNECT \${connectPayload}\\r\\n\`);
    state.ready = true;
    for (const message of state.queue) {
      socket.send(message);
    }
    state.queue = [];
  });

  socket.addEventListener("close", () => {
    state.ready = false;
  });

  return state;
}

async function __getNatsConnection() {
  if (!__ORIGAN_NATS_WS_SERVER) {
    return null;
  }
  const conn = await new Promise((resolve) => {
    const next = __buildNatsConnection(__ORIGAN_NATS_WS_SERVER);
    next.socket.addEventListener("open", () => resolve(next));
    next.socket.addEventListener("error", () => resolve(null));
  });
  return conn;
}

async function __publishNatsLog(conn, subject, payload) {
  if (!conn) {
    return;
  }
  const message = \`PUB \${subject} \${payload.length}\\r\\n\${payload}\\r\\n\`;
  if (conn.ready) {
    conn.socket.send(message);
  } else {
    conn.queue.push(message);
  }
}

async function __sha1Hex(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const digest = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function __sendLog(level, args) {
  try {
    const store = __logStorage.getStore();
    if (!store) {
      return;
    }
    const functionPath = __process.env.ORIGAN_FUNCTION_PATH || "";
    const projectId = __process.env.ORIGAN_PROJECT_ID || "";
    const deploymentId = __process.env.ORIGAN_DEPLOYMENT_ID || "";
    if (!functionPath || !projectId || !deploymentId) {
      return;
    }
    const functionHash = await __sha1Hex(functionPath);
    const subject = \`logs.\${projectId}.\${deploymentId}.\${functionHash}\`;
    const payload = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message: __formatLogArgs(args),
      functionPath,
      projectId,
      deploymentId,
    });
    if (!store.conn) {
      store.conn = await __getNatsConnection();
    }
    await __publishNatsLog(store.conn, subject, payload);
  } catch {
    // Ignore log forwarding errors to avoid recursive logging.
  }
}

const __console = globalThis.console ?? {};
globalThis.console = {
  ...__console,
  log: (...args) => {
    __console.log?.(...args);
    void __sendLog("info", args);
  },
  info: (...args) => {
    __console.info?.(...args);
    void __sendLog("info", args);
  },
  warn: (...args) => {
    __console.warn?.(...args);
    void __sendLog("warn", args);
  },
  error: (...args) => {
    __console.error?.(...args);
    void __sendLog("error", args);
  },
};

let __userPromise;
async function __getUser() {
  if (!__userPromise) {
    __userPromise = import("./user.js");
  }
  return __userPromise;
}

async function __handle(request, env, ctx) {
  const user = await __getUser();
  const handler =
    (user.default && user.default.fetch) ||
    user.fetch ||
    user.default;
  if (typeof handler !== "function") {
    throw new Error("User module does not export a fetch handler");
  }
  const store = { conn: null };
  return __logStorage.run(store, async () => {
    try {
      return await handler(request, env, ctx);
    } finally {
      if (store.conn?.socket) {
        store.conn.socket.close();
      }
    }
  });
}

export default { fetch: __handle };
export const fetch = __handle;
`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/__origan/log" && request.method === "POST") {
      if (request.headers.get("x-origan-internal-log") !== "1") {
        return new Response("Forbidden", { status: 403 });
      }
      try {
        const payload = await request.json();
        const projectId = payload?.projectId;
        const deploymentId = payload?.deploymentId;
        const functionPath = payload?.functionPath;
        if (!projectId || !deploymentId || !functionPath) {
          return new Response("Missing log metadata", { status: 400 });
        }
        const functionHash = await sha1Hex(functionPath);
        const logSubject = `logs.${projectId}.${deploymentId}.${functionHash}`;
        await publishNatsLog(
          env,
          logSubject,
          JSON.stringify({
            timestamp: payload?.timestamp || new Date().toISOString(),
            level: payload?.level || "info",
            message: payload?.message || "",
            functionPath,
            projectId,
            deploymentId,
          }),
        );
        return new Response(null, { status: 204 });
      } catch {
        return new Response("Failed to handle log", { status: 500 });
      }
    }

    const functionPath = request.headers.get("x-origan-function-path");
    const deploymentId = request.headers.get("x-origan-deployment-id");
    const projectId = request.headers.get("x-origan-project-id");

    if (!functionPath || !deploymentId || !projectId) {
      return new Response("Missing required headers", { status: 400 });
    }

    const functionHash = await sha1Hex(functionPath);
    const invocationId = crypto.randomUUID();
    const workerName = `${projectId}-${deploymentId}-${functionHash}-${invocationId}`;
    const logSubject = `logs.${projectId}.${deploymentId}.${functionHash}`;

    const natsConn = await getNatsConnection(env);
    try {
      await publishNatsLog(
        env,
        logSubject,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "info",
          message: "Invocation started",
          functionPath,
        }),
        natsConn,
      );

      const envVars = await loadMetadata(env, deploymentId);
      const code = await loadUserCode(env, functionPath);

      const mergedEnv = {
        ...envVars,
        ORIGAN_FUNCTION_PATH: functionPath,
        ORIGAN_DEPLOYMENT_ID: deploymentId,
        ORIGAN_PROJECT_ID: projectId,
      };

      const worker = await env.USER_LOADER.get(workerName, async () => {
        return {
          mainModule: "wrapper.js",
          modules: {
            "wrapper.js": buildWrapperModule(
              mergedEnv,
              env.EVENTS_NATS_WS_SERVER,
            ),
            "user.js": code,
          },
          compatibilityDate: "2026-01-01",
          compatibilityFlags: [
            "nodejs_compat",
            "nodejs_compat_populate_process_env",
          ],
          env: mergedEnv,
        };
      });

      const fetcher = worker.getEntrypoint();
      const response = await fetcher.fetch(request);
      await publishNatsLog(
        env,
        logSubject,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "info",
          message: `Invocation completed with status ${response.status}`,
          functionPath,
        }),
        natsConn,
      );
      return response;
    } catch (error) {
      console.error("Runner error:", error);
      await publishNatsLog(
        env,
        logSubject,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "error",
          message:
            error instanceof Error ? error.message : "Unknown runner error",
          functionPath,
        }),
        natsConn,
      );
      return new Response("Failed to run worker", { status: 500 });
    } finally {
      if (natsConn?.socket) {
        natsConn.socket.close();
      }
    }
  },
};
