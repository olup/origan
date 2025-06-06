import * as pulumi from "@pulumi/pulumi";
import { z } from "zod";

const GithubConfig = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  webhookSecret: z.string(),
  appId: z.string(),
  appPrivateKeyBase64: z.string(),
});

const AxiomConfig = z.object({
  token: z.string(),
  dataset: z.string(),
});

const Config = z.object({
  github: GithubConfig,
  axiom: AxiomConfig,
});

type Config = z.infer<typeof Config>;

export function parseConfig(): Config {
  const config = Config.parse(
    new pulumi.Config().requireObject<object>("origan"),
  );
  return config;
}

export const config = parseConfig();
