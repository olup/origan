import { fetchEventData, type ServerSentEvent } from "fetch-sse";
import { z } from "zod";
import { baseClient } from "../libs/client.js";
import { getAccessToken } from "./auth.service.js";

const LogEntry = z.object({
  timestamp: z.string().datetime(),
  msg: z.string(),
  level: z.string(),
});

export type DeploymentLog = z.infer<typeof LogEntry>;

export async function streamLogs(
  deploymentId: string,
  onMessage: (message: DeploymentLog) => void,
) {
  const token = await getAccessToken();

  await fetchEventData(
    baseClient.logs.stream[":deploymentId"]
      .$url({
        param: {
          deploymentId,
        },
      })
      .toString(),
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      onError: (error) => {
        console.error(error);
      },
      onMessage: (message: ServerSentEvent | null) => {
        if (!message) {
          return;
        }
        const data = JSON.parse(message.data);
        const deploymentLog = LogEntry.parse(data);
        onMessage(deploymentLog);
      },
    },
  );
}
