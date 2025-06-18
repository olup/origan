import { AsyncLocalStorage } from "node:async_hooks";
import { openTelemetryPlugin } from "@loglayer/plugin-opentelemetry";
import { PinoTransport } from "@loglayer/transport-pino";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
// Importing necessary OpenTelemetry packages including the core SDK, auto-instrumentations, OTLP trace exporter, and batch span processor
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { createMiddleware } from "hono/factory";
import { type ILogLayer, LogLayer } from "loglayer";
import { pino } from "pino";

import { env } from "./config.js";

const transport = new PinoTransport({
  logger: pino(
    env.APP_ENV === "development"
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              ignore: "pid,hostname",
            },
          },
        }
      : {},
  ),
});

function createLogger() {
  return new LogLayer({
    transport,
    plugins: [openTelemetryPlugin()],
  });
}

const defaultLogger = createLogger();

export const asyncLocalStorage = new AsyncLocalStorage<{ logger: ILogLayer }>();

export function getLogger() {
  const store = asyncLocalStorage.getStore();

  if (!store) {
    return defaultLogger;
  }

  return store.logger;
}

export type Env = {
  Variables: {
    log: ILogLayer;
  };
};

export const loggerMiddleware = createMiddleware<Env>(async (c, next) => {
  const logger = createLogger().withContext({
    request: { id: c.var.requestId },
  });
  c.set("log", logger);
  return asyncLocalStorage.run({ logger }, next);
});

function startSdk(conf: { token: string; dataset: string }) {
  // Initialize OTLP trace exporter with the endpoint URL and headers
  const traceExporter = new OTLPTraceExporter({
    url: "https://api.axiom.co/v1/traces",
    headers: {
      Authorization: `Bearer ${conf.token}`,
      "X-Axiom-Dataset": conf.dataset,
    },
  });

  // Creating a resource to identify your service in traces
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "control-api",
  });

  // Configuring the OpenTelemetry Node SDK
  const sdk = new NodeSDK({
    // Adding a BatchSpanProcessor to batch and send traces
    spanProcessor: new BatchSpanProcessor(traceExporter),

    // Registering the resource to the SDK
    resource: resource,

    // Adding auto-instrumentations to automatically collect trace data
    instrumentations: [getNodeAutoInstrumentations()],
  });

  // Starting the OpenTelemetry SDK to begin collecting telemetry data
  sdk.start();
}

if (env.APP_ENV === "development") {
  if (env.AXIOM_TOKEN && env.AXIOM_DATASET) {
    startSdk({ token: env.AXIOM_TOKEN, dataset: env.AXIOM_DATASET });
  }
} else {
  if (!env.AXIOM_TOKEN || !env.AXIOM_DATASET) {
    throw new Error(
      "Axiom env variables should be set in production, and zod should have caught that even earlier than that",
    );
  }
  startSdk({ token: env.AXIOM_TOKEN, dataset: env.AXIOM_DATASET });
}
