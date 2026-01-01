import * as docker from "@pulumi/docker";
import * as pulumi from "@pulumi/pulumi";
import {
  imageTag,
  prebuiltImageDigests,
  registryEndpoint,
  resolveImageTags,
  singleNodeImage,
} from "../config.js";
import { dockerProvider } from "../providers.js";
import {
  type BakeTarget,
  type BuildxBakeResult,
  buildxBake,
  createImageTags,
} from "./buildx-bake.js";

/**
 * All Docker images built in a single parallel bake operation.
 * This replaces individual buildxImage() calls in each service file.
 */
type ImageBuildResult = {
  images: BuildxBakeResult["images"];
  bakeResource: pulumi.Resource;
};

const nodeServicesTarget = "node-services";
const requiredTargets = singleNodeImage
  ? [nodeServicesTarget, "runner"]
  : ["control-api", "gateway", "builder", "runner"];
const hasPrebuiltImages = (
  digests: Record<string, string> | null,
): digests is Record<string, string> =>
  !!digests && requiredTargets.every((target) => Boolean(digests[target]));

let allImages: ImageBuildResult;

const resolveDigestFromTag = (tag: pulumi.Input<string>) => {
  const primaryTag = pulumi.output(tag);
  const registryImage = docker.getRegistryImageOutput(
    { name: primaryTag },
    { provider: dockerProvider },
  );
  const repoDigest = pulumi
    .all([primaryTag, registryImage.sha256Digest])
    .apply(([resolvedTag, digest]) => {
      const repository = (resolvedTag ?? "").replace(/:[^:@]+$/, "");
      if (!digest) {
        throw new Error(`Registry returned empty digest for ${resolvedTag}`);
      }
      return `${repository}@${digest}`;
    });
  return { repoDigest };
};

if (hasPrebuiltImages(prebuiltImageDigests)) {
  pulumi.log.info("Using prebuilt image digests; skipping buildx bake.");

  const images: ImageBuildResult["images"] = {};
  for (const target of requiredTargets) {
    images[target] = {
      allTags: pulumi.output(
        createImageTags(registryEndpoint, target, imageTag),
      ),
      repoDigest: pulumi.output(prebuiltImageDigests?.[target]),
    };
  }

  allImages = {
    images,
    bakeResource: new pulumi.ComponentResource(
      "origan:images:prebuilt",
      "prebuilt-images",
    ),
  };
} else if (resolveImageTags) {
  pulumi.log.info("Resolving image digests from tags; skipping buildx bake.");

  const images: ImageBuildResult["images"] = {};
  for (const target of requiredTargets) {
    const tags = createImageTags(registryEndpoint, target, imageTag);
    const { repoDigest } = resolveDigestFromTag(tags[0]);
    images[target] = {
      allTags: pulumi.output(tags),
      repoDigest,
    };
  }

  allImages = {
    images,
    bakeResource: new pulumi.ComponentResource(
      "origan:images:resolved",
      "resolved-images",
    ),
  };
} else {
  const targets: Record<string, BakeTarget> = {};
  if (singleNodeImage) {
    targets[nodeServicesTarget] = {
      dockerfile: "docker/prod-optimized.Dockerfile",
      context: ".",
      target: nodeServicesTarget,
      tags: createImageTags(registryEndpoint, nodeServicesTarget, imageTag),
    };
    targets.runner = {
      dockerfile: "docker/prod-optimized.Dockerfile",
      context: ".",
      target: "runner",
      tags: createImageTags(registryEndpoint, "runner", imageTag),
    };
  } else {
    targets["control-api"] = {
      dockerfile: "docker/prod-optimized.Dockerfile",
      context: ".",
      target: "control-api",
      tags: createImageTags(registryEndpoint, "control-api", imageTag),
    };
    targets.gateway = {
      dockerfile: "docker/prod-optimized.Dockerfile",
      context: ".",
      target: "gateway",
      tags: createImageTags(registryEndpoint, "gateway", imageTag),
    };
    targets.builder = {
      dockerfile: "docker/prod-optimized.Dockerfile",
      context: ".",
      target: "builder",
      tags: createImageTags(registryEndpoint, "builder", imageTag),
    };
    targets.runner = {
      dockerfile: "docker/prod-optimized.Dockerfile",
      context: ".",
      target: "runner",
      tags: createImageTags(registryEndpoint, "runner", imageTag),
    };
  }

  allImages = buildxBake("origan-images", {
    targets,
    push: true,
  });
}

// Export individual image references for use in service deployments
const nodeServicesImage = singleNodeImage
  ? allImages.images[nodeServicesTarget]
  : null;

export const controlApiImage = singleNodeImage
  ? nodeServicesImage!
  : allImages.images["control-api"];
export const gatewayImage = singleNodeImage
  ? nodeServicesImage!
  : allImages.images.gateway;
export const builderImage = singleNodeImage
  ? nodeServicesImage!
  : allImages.images.builder;
export const runnerImage = allImages.images.runner;

// Export the bake resource for dependency management
export const imagesBakeResource = allImages.bakeResource;
