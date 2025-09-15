import { DockerImage } from "../resources/docker/image.js";

export interface BuilderDeploymentResult {
  image: DockerImage;
}

/**
 * Deploy the Origan Builder (builds user projects in isolated environments)
 * Note: This only builds and pushes the image. The actual builder instances
 * are created as Kubernetes Jobs by the control-api when builds are triggered.
 */
export async function deployBuilder(
  imageTag?: string,
): Promise<BuilderDeploymentResult> {
  // Build and push Builder Docker image with unique tag
  const tag = imageTag || Date.now().toString();
  const image = await DockerImage("builder-image", {
    registryUrl: "registry.platform.origan.dev",
    imageName: "builder",
    tag: tag, // Unique tag for each deployment
    context: "../", // Monorepo root
    dockerfile: "build/docker/prod-optimized.Dockerfile",
    target: "builder", // Target the 'builder' stage in multistage build
    platforms: ["linux/amd64"],
    buildArgs: {
      NODE_ENV: "production",
      BUILD_VERSION: tag, // Use same timestamp for consistency
    },
    push: true,
  });

  // No deployment needed - builder runs as ephemeral Kubernetes Jobs
  // The control-api creates these jobs on-demand when builds are triggered
  // using the image we just built and pushed

  return {
    image,
  };
}
