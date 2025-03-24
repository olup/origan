import staticPlugin from "@elysiajs/static";
import { Elysia } from "elysia";
import api from "./api";

async function serveProdFrontendAssetsIfAvailable(app: Elysia) {
  const base = "../frontend";
  const indexHTML = Bun.file(`${base}/dist/index.html`);
  console.log(await indexHTML.exists());
  if (!(await indexHTML.exists())) {
    return;
  }

  app
    .use(staticPlugin({ assets: `${base}/public`, indexHTML: false }))
    .use(
      staticPlugin({
        assets: `${base}/dist/assets`,
        prefix: "/assets",
        indexHTML: false,
      }),
    )
    .get("/", () => "Hello Elysia");
}

export const app = new Elysia().use(api);

await serveProdFrontendAssetsIfAvailable(app);

app.listen({ port: 8000 });

console.log(`🦊 Elysia is running at ${app.server?.url}`);

export type Server = typeof app;
