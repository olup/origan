import { AsyncLocalStorage } from "node:async_hooks";
import { openTelemetryPlugin } from "@loglayer/plugin-opentelemetry";
import { PinoTransport } from "@loglayer/transport-pino";
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
