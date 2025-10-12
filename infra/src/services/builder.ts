import * as pulumi from "@pulumi/pulumi";
import { builderImageTag, registryEndpoint } from "../config.js";
import { buildxImage } from "../core/buildx-image.js";

// Build Docker image for the builder via buildx push-only workflow
// This image is used by control-api to run build jobs
export const builderImage = buildxImage("builder-image", {
  imageName: pulumi.interpolate`${registryEndpoint}/origan/builder:${builderImageTag}`,
  context: "..", // Monorepo root (from infra directory)
  dockerfile: "../docker/prod-optimized.Dockerfile",
  target: "builder", // Use builder stage from multi-stage build
  platform: "linux/amd64",
});

// Export the immutable image reference for use by control-api
export const builderImageUrl = builderImage.repoDigest;
