import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
// Importing necessary OpenTelemetry packages including the core SDK, auto-instrumentations, OTLP trace exporter, and batch span processor
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

import { env } from "./config.js";

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
