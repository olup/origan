import { DockerImage } from "../resources/docker/image.js";
import { Deployment } from "../resources/k3s/deployment.js";
import { Ingress } from "../resources/k3s/ingress.js";
import {
  type ClusterRole,
  type ClusterRoleBinding,
  K3sClusterRole,
  K3sClusterRoleBinding,
} from "../resources/k3s/rbac.js";
import {
  K3sServiceAccount,
  type ServiceAccount,
} from "../resources/k3s/service-account.js";

export interface ControlApiDeploymentProps {
  namespace: string;
  databaseEndpoint: string;
  natsEndpoint: string;
  bucketName: string;
}

export interface ControlApiDeploymentResult {
  serviceAccount: ServiceAccount;
  clusterRole: ClusterRole;
  clusterRoleBinding: ClusterRoleBinding;
  image: DockerImage;
  deployment: Deployment;
  ingress: Ingress;
}

/**
 * Deploy the Origan Control API
 */
export async function deployControlApi(
  props: ControlApiDeploymentProps,
): Promise<ControlApiDeploymentResult> {
  // Create ServiceAccount for control-api
  const serviceAccount = await K3sServiceAccount("control-api-sa", {
    namespace: props.namespace,
    labels: {
      app: "control-api",
    },
  });

  // Create ClusterRole for control-api to manage jobs
  const clusterRole = await K3sClusterRole("control-api-job-manager", {
    rules: [
      {
        apiGroups: ["batch"],
        resources: ["jobs"],
        verbs: ["create", "get", "list", "watch", "delete", "update", "patch"],
      },
      {
        apiGroups: [""],
        resources: ["pods"],
        verbs: ["get", "list", "watch"],
      },
      {
        apiGroups: [""],
        resources: ["pods/log"],
        verbs: ["get"],
      },
    ],
    labels: {
      app: "control-api",
    },
  });

  // Create ClusterRoleBinding
  const clusterRoleBinding = await K3sClusterRoleBinding(
    "control-api-job-manager-binding",
    {
      roleRef: {
        apiGroup: "rbac.authorization.k8s.io",
        kind: "ClusterRole",
        name: "control-api-job-manager",
      },
      subjects: [
        {
          kind: "ServiceAccount",
          name: "control-api-sa",
          namespace: props.namespace,
        },
      ],
      labels: {
        app: "control-api",
      },
    },
  );

  // Build and push Control API Docker image
  const image = await DockerImage("control-api-image", {
    registryUrl: "registry.platform.origan.dev",
    imageName: "control-api",
    tag: "latest",
    context: "../", // Monorepo root (origan)
    dockerfile: "build/docker/prod.Dockerfile", // Dockerfile path relative to context
    target: "control-api", // Target the 'control-api' stage in multistage build
    platforms: ["linux/amd64"], // Build for x86_64 architecture
    buildArgs: {
      NODE_ENV: "production",
      BUILD_VERSION: Date.now().toString(), // Force rebuild on each deployment
    },
    push: true,
  });

  // Deploy Control API
  const deployment = await Deployment("control-api", {
    namespace: props.namespace,
    serviceAccountName: "control-api-sa",
    image: image.fullImageUrl,
    replicas: 2,
    ports: [{ name: "http", containerPort: 9999 }],
    labels: {
      "deploy-version": Date.now().toString(), // Force redeploy
    },
    env: [
      // Basic configuration
      { name: "NODE_ENV", value: "production" },
      { name: "APP_ENV", value: "production" },
      { name: "PORT", value: "9999" },

      // Domain configuration
      { name: "ORIGAN_DEPLOY_DOMAIN", value: "origan.app" },
      { name: "ORIGAN_API_URL", value: "https://api.origan.dev" },
      { name: "ORIGAN_ADMIN_PANEL_URL", value: "https://app.origan.dev" },

      // Database connection
      {
        name: "DATABASE_URL",
        value: `postgresql://origan_root:${process.env.POSTGRES_PASSWORD || "postgres"}@${props.databaseEndpoint}/origan`,
      },
      { name: "DATABASE_RUN_MIGRATIONS", value: "true" },

      // NATS connection
      { name: "EVENTS_NATS_SERVER", value: `nats://${props.natsEndpoint}` },

      // S3/Garage configuration for deployments
      { name: "BUCKET_URL", value: process.env.GARAGE_ENDPOINT },
      { name: "BUCKET_ACCESS_KEY", value: process.env.GARAGE_ACCESS_KEY || "" },
      { name: "BUCKET_SECRET_KEY", value: process.env.GARAGE_SECRET_KEY || "" },
      { name: "BUCKET_NAME", value: props.bucketName },
      { name: "BUCKET_REGION", value: "garage" },

      // GitHub OAuth (from environment)
      { name: "GITHUB_CLIENT_ID", value: process.env.GITHUB_CLIENT_ID },
      { name: "GITHUB_CLIENT_SECRET", value: process.env.GITHUB_CLIENT_SECRET },

      // JWT Secret for auth
      { name: "JWT_SECRET", value: process.env.JWT_SECRET },

      // GitHub App configuration
      { name: "GITHUB_APP_ID", value: process.env.GITHUB_APP_ID },
      {
        name: "GITHUB_APP_PRIVATE_KEY_BASE64",
        value: process.env.GITHUB_APP_PRIVATE_KEY_BASE64,
      },
      {
        name: "GITHUB_WEBHOOK_SECRET",
        value: process.env.GITHUB_WEBHOOK_SECRET,
      },

      // Docker Registry and build configuration
      {
        name: "DOCKER_REGISTRY",
        value: "docker-registry.platform.svc.cluster.local:5000",
      },
      {
        name: "BUILDER_IMAGE",
        value: "registry.platform.origan.dev/builder:latest",
      },
    ],
    resources: {
      requests: {
        memory: "256Mi",
        cpu: "100m",
      },
      limits: {
        memory: "512Mi",
        cpu: "500m",
      },
    },
    readinessProbe: {
      httpGet: {
        path: "/.healthz",
        port: 9999,
      },
      initialDelaySeconds: 10,
      periodSeconds: 10,
    },
    livenessProbe: {
      httpGet: {
        path: "/.healthz",
        port: 9999,
      },
      initialDelaySeconds: 30,
      periodSeconds: 30,
    },
  });

  // Create Ingress for API
  const ingress = await Ingress("control-api-ingress", {
    namespace: props.namespace,
    hostname: "api.origan.dev",
    backend: {
      service: deployment.name,
      port: 9999,
    },
    tls: true,
  });

  return {
    serviceAccount,
    clusterRole,
    clusterRoleBinding,
    image,
    deployment,
    ingress,
  };
}
