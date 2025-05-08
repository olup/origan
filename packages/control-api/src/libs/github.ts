import { App } from "@octokit/app";
import { env } from "../config.js";

const fromBase64 = (base64: string): string => {
  const buffer = Buffer.from(base64, "base64");
  return buffer.toString("utf-8");
};

const privateKey = fromBase64(env.GITHUB_APP_PRIVATE_KEY_BASE64);

export const githubAppInstance = new App({
  appId: env.GITHUB_APP_ID,
  privateKey,
});
