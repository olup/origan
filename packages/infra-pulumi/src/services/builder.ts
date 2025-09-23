import * as pulumi from "@pulumi/pulumi";
import * as docker from "@pulumi/docker";
import { dockerProvider } from "../providers.js";
import { builderImageTag, registryEndpoint } from "../config.js";

// Build Docker image for the builder
// This image is used by control-api to run build jobs
export const builderImage = new docker.Image("builder-image", {
  imageName: pulumi.interpolate`${registryEndpoint}/origan/builder:${builderImageTag}`,
  build: {
    context: "../builder",
    dockerfile: "../builder/Dockerfile",
    platform: "linux/amd64",
  },
  skipPush: false,
}, { provider: dockerProvider });

// Export the full image URL for use by control-api
export const builderImageUrl = builderImage.imageName;