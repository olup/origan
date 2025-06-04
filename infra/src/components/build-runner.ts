import * as pulumi from "@pulumi/pulumi";
import { dockerImageWithTag, gn } from "../utils";
import type { RegistryOutputs } from "./registry";

export interface BuildRunnerImageOutputs {
  imageUri: pulumi.Output<string>;
}

// this package is only needed to build the image and push it
// to the registry. We do not create a deployment for it.
export function deployBuildRunnerImage(
  registry: RegistryOutputs,
): BuildRunnerImageOutputs {
  const image = dockerImageWithTag(gn("build-runner"), {
    build: {
      context: "../",
      dockerfile: "../dockerfiles/prod.Dockerfile",
      platform: "linux/amd64",
      target: "build-runner",
    },
    imageName: pulumi.interpolate`${registry.namespace.endpoint}/build-runner`,
    registry: {
      server: registry.namespace.endpoint,
      username: registry.registryApiKey.accessKey,
      password: registry.registryApiKey.secretKey,
    },
  });

  return {
    imageUri: pulumi.interpolate`${registry.namespace.endpoint}/build-runner:${image.digestTag}`,
  };
}
