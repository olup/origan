import type { AppRouter } from "@origan/control-api/src/trpc/router";
import type { inferRouterOutputs } from "@trpc/server";
import { setAccessToken, trpc } from "../libs/trpc-client.js";
import { getAccessToken } from "./auth.service.js";

export type DeploymentLog = inferRouterOutputs<AppRouter>["logs"]["stream"];
export type BuildLog = inferRouterOutputs<AppRouter>["builds"]["streamLogs"];

export async function streamDeploymentLogs(
  deploymentRef: string,
  onMessage: (message: DeploymentLog) => void,
) {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("You must be logged in to stream logs.");
  }
  setAccessToken(token);
  await new Promise<void>((resolve, reject) => {
    const subscription = trpc.logs.stream.subscribe(
      { deploymentRef },
      {
        onData: (log) => {
          onMessage(log);
        },
        onError: (error) => {
          reject(error);
        },
        onComplete: () => {
          subscription.unsubscribe();
          resolve();
        },
      },
    );
  });
}

export async function streamBuildLogs(
  deploymentRef: string,
  onMessage: (message: BuildLog) => void,
) {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("You must be logged in to stream logs.");
  }
  setAccessToken(token);
  await new Promise<void>((resolve, reject) => {
    const subscription = trpc.builds.streamLogs.subscribe(
      { deploymentRef },
      {
        onData: (log) => {
          onMessage(log);
        },
        onError: (error) => {
          reject(error);
        },
        onComplete: () => {
          subscription.unsubscribe();
          resolve();
        },
      },
    );
  });
}
