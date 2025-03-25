import api from "./api";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";

async function serveProdFrontendAssetsIfAvailable(app: Hono) {
  const base = "../frontend";
  const indexHTML = Bun.file(`${base}/dist/index.html`);
  console.log(await indexHTML.exists());
  if (!(await indexHTML.exists())) {
    return;
  }

  app
    .use(serveStatic({ root: `${base}/public` }))
    .use(
      serveStatic({
        root: `${base}/dist/assets`,
        path: "/assets",
      }),
    )
    .get("/", (c) => c.text("Hello Hono"));
}

export const app = new Hono().route("/", api);

await serveProdFrontendAssetsIfAvailable(app);

export default {
  fetch: app.fetch,
  port: 8000
}
