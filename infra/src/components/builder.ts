import * as pulumi from "@pulumi/pulumi";
import { dockerImageWithTag, gn } from "../utils";
import type { RegistryOutputs } from "./registry";

export interface BuilderImageOutputs {
  imageUri: pulumi.Output<string>;
}

// this package is only needed to build the image and push it
// to the registry. We do not create a deployment for it.
export function deployBuilderImage(
  registry: RegistryOutputs,
): BuilderImageOutputs {
  const image = dockerImageWithTag(gn("builder"), {
    build: {
      context: "../",
      dockerfile: "../build/docker/prod.Dockerfile",
      platform: "linux/amd64",
      target: "builder",
    },
    imageName: pulumi.interpolate`${registry.namespace.endpoint}/builder`,
    registry: {
      server: registry.namespace.endpoint,
      username: registry.registryApiKey.accessKey,
      password: registry.registryApiKey.secretKey,
    },
  });

  return {
    imageUri: pulumi.interpolate`${registry.namespace.endpoint}/builder:${image.digestTag}`,
  };
}
