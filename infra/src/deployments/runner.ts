import { DockerImage } from "../resources/docker/image.js";
import { Deployment } from "../resources/k3s/deployment.js";

export interface RunnerDeploymentProps {
  namespace: string;
  bucketName: string;
  bucketEndpoint: string;
  bucketAccessKey: string;
  bucketSecretKey: string;
  natsEndpoint: string;
}

export interface RunnerDeploymentResult {
  image: DockerImage;
  deployment: Deployment;
}

/**
 * Deploy the Origan Runner (edge runtime for executing user functions)
 */
export async function deployRunner(
  props: RunnerDeploymentProps,
): Promise<RunnerDeploymentResult> {
  // Build and push Runner Docker image with unique tag
  const imageTag = Date.now().toString();
  const image = await DockerImage("runner-image", {
    registryUrl: "registry.platform.origan.dev",
    imageName: "runner",
    tag: imageTag, // Unique tag for each deployment
    context: "../", // Monorepo root
    dockerfile: "build/docker/prod.Dockerfile",
    target: "runner", // Target the 'runner' stage in multistage build
    platforms: ["linux/amd64"],
    buildArgs: {
      BUILD_VERSION: imageTag, // Use same timestamp for consistency
    },
    push: true,
  });

  // Deploy Runner
  const deployment = await Deployment("runner", {
    namespace: props.namespace,
    image: image.fullImageUrl,
    replicas: 2,
    ports: [{ name: "http", containerPort: 9000 }],
    labels: {
      "deploy-version": Date.now().toString(),
    },
    env: [
      // S3/Garage configuration for reading deployment artifacts
      { name: "BUCKET_URL", value: props.bucketEndpoint },
      { name: "BUCKET_NAME", value: props.bucketName },
      { name: "BUCKET_ACCESS_KEY", value: props.bucketAccessKey },
      { name: "BUCKET_SECRET_KEY", value: props.bucketSecretKey },
      { name: "BUCKET_REGION", value: "garage" },

      // Workers configuration
      { name: "WORKERS_PATH", value: "/workers" },

      // NATS connection for events
      { name: "EVENTS_NATS_SERVER", value: `nats://${props.natsEndpoint}` },

      // Runtime configuration
      { name: "MAIN_SERVICE", value: "/app/functions/supervisor" },
    ],
    resources: {
      requests: {
        memory: "128Mi",
        cpu: "100m",
      },
      limits: {
        memory: "256Mi",
        cpu: "200m",
      },
    },
  });

  // Service is automatically created by the Deployment resource when ports are defined
  // The runner service is accessed internally by the gateway at http://runner.origan.svc.cluster.local:9000

  return {
    image,
    deployment,
  };
}
