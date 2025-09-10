import { DockerImage } from "../resources/docker/image.js";
import { Deployment } from "../resources/k3s/deployment.js";
import { Ingress } from "../resources/k3s/ingress.js";

export interface GatewayDeploymentProps {
  namespace: string;
  bucketName: string;
  bucketEndpoint: string;
  bucketAccessKey: string;
  bucketSecretKey: string;
}

export interface GatewayDeploymentResult {
  image: DockerImage;
  deployment: Deployment;
  ingress: Ingress;
}

/**
 * Deploy the Origan Gateway (reverse proxy for user deployments)
 */
export async function deployGateway(
  props: GatewayDeploymentProps,
): Promise<GatewayDeploymentResult> {
  // Build and push Gateway Docker image
  const image = await DockerImage("gateway-image", {
    registryUrl: "registry.platform.origan.dev",
    imageName: "gateway",
    tag: "latest",
    context: "../", // Monorepo root
    dockerfile: "build/docker/prod.Dockerfile",
    target: "gateway", // Target the 'gateway' stage in multistage build
    platforms: ["linux/amd64"],
    buildArgs: {
      NODE_ENV: "production",
      BUILD_VERSION: Date.now().toString(),
    },
    push: true,
  });

  // Deploy Gateway
  const deployment = await Deployment("gateway", {
    namespace: props.namespace,
    image: image.fullImageUrl,
    replicas: 2,
    ports: [
      { name: "http", containerPort: 7777 },
      { name: "https", containerPort: 7778 },
    ],
    labels: {
      "deploy-version": Date.now().toString(),
    },
    env: [
      // Domain configuration
      { name: "ORIGAN_DEPLOY_DOMAIN", value: "origan.app" },

      // Service discovery (internal cluster URLs)
      {
        name: "CONTROL_API_URL",
        value: "http://control-api.origan.svc.cluster.local:9999",
      },
      {
        name: "RUNNER_URL",
        value: "http://runner.origan.svc.cluster.local:9000",
      },

      // S3/Garage configuration for serving user deployments
      { name: "BUCKET_URL", value: props.bucketEndpoint },
      { name: "BUCKET_NAME", value: props.bucketName },
      { name: "BUCKET_ACCESS_KEY", value: props.bucketAccessKey },
      { name: "BUCKET_SECRET_KEY", value: props.bucketSecretKey },
      { name: "BUCKET_REGION", value: "garage" },

      // TLS configuration (disabled for now, using Traefik for TLS termination)
      { name: "HAS_TLS_SERVER", value: "false" },
      { name: "TLS_CERT_FILE", value: "/tmp/cert.pem" }, // Dummy values, not used when HAS_TLS_SERVER=false
      { name: "TLS_KEY_FILE", value: "/tmp/key.pem" },
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
    readinessProbe: {
      httpGet: {
        path: "/health",
        port: 7777,
      },
      initialDelaySeconds: 10,
      periodSeconds: 10,
    },
    livenessProbe: {
      httpGet: {
        path: "/health",
        port: 7777,
      },
      initialDelaySeconds: 30,
      periodSeconds: 30,
    },
  });

  // Service is automatically created by the Deployment resource when ports are defined

  // Create wildcard Ingress for all *.origan.app domains
  const ingress = await Ingress("gateway-ingress", {
    namespace: props.namespace,
    hostname: "*.origan.app",
    backend: {
      service: "gateway",
      port: 7777, // HTTP port for now
    },
    tls: true, // Traefik will handle TLS termination for now
  });

  return {
    image,
    deployment,
    ingress,
  };
}
