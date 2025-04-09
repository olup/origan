import type { IncomingMessage, ServerResponse } from "node:http";

export async function handleHealthCheck(
  req: IncomingMessage,
  res: ServerResponse,
) {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return true;
  }
  return false;
}
