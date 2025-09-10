import { DockerImage } from "../resources/docker/image.js";

export interface BuilderDeploymentProps {
  namespace: string;
}

export interface BuilderDeploymentResult {
  image: DockerImage;
}

/**
 * Deploy the Origan Builder (builds user projects in isolated environments)
 * Note: This only builds and pushes the image. The actual builder instances
 * are created as Kubernetes Jobs by the control-api when builds are triggered.
 */
export async function deployBuilder(
  props: BuilderDeploymentProps,
): Promise<BuilderDeploymentResult> {
  // Build and push Builder Docker image
  const image = await DockerImage("builder-image", {
    registryUrl: "registry.platform.origan.dev",
    imageName: "builder",
    tag: "latest",
    context: "../", // Monorepo root
    dockerfile: "build/docker/prod.Dockerfile",
    target: "builder", // Target the 'builder' stage in multistage build
    platforms: ["linux/amd64"],
    buildArgs: {
      NODE_ENV: "production",
      BUILD_VERSION: Date.now().toString(),
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
