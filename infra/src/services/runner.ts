import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import * as docker from "@pulumi/docker";
import { k8sProvider, dockerProvider } from "../providers.js";
import { namespaceName_ } from "../core/namespace.js";
import { deploymentBucketName, garageEndpointInternal, garageAccessKeyValue, garageSecretKeyValue } from "../core/garage.js";
import { natsEndpoint } from "../core/nats.js";
import { 
  resourceName, 
  labels, 
  imageTag, 
  registryEndpoint,
} from "../config.js";

// Build Docker image
export const runnerImage = new docker.Image("runner-image", {
  imageName: pulumi.interpolate`${registryEndpoint}/origan/runner:${imageTag}`,
  build: {
    context: "..", // Monorepo root (from infra directory)
    dockerfile: "../docker/prod-optimized.Dockerfile",
    target: "runner", // Use runner stage from multi-stage build
    platform: "linux/amd64",
  },
  skipPush: false,
}, { provider: dockerProvider });

// ConfigMap
const runnerConfig = new kubernetes.core.v1.ConfigMap("runner-config", {
  metadata: {
    name: resourceName("runner-config"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "runner",
    },
  },
  data: {
    NODE_ENV: "production",
    PORT: "9000",
    // S3/Garage configuration for reading deployment artifacts
    BUCKET_URL: garageEndpointInternal,
    BUCKET_NAME: deploymentBucketName,
    BUCKET_REGION: "garage",
    // Workers configuration
    WORKERS_PATH: "/workers",
    // Runtime configuration
    MAIN_SERVICE: "/app/functions/supervisor",
    // NATS connection
    EVENTS_NATS_SERVER: natsEndpoint,
  },
}, { provider: k8sProvider });

// Secret
const runnerSecret = new kubernetes.core.v1.Secret("runner-secret", {
  metadata: {
    name: resourceName("runner-secret"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "runner",
    },
  },
  stringData: {
    BUCKET_ACCESS_KEY: garageAccessKeyValue || "",
    BUCKET_SECRET_KEY: garageSecretKeyValue?.apply(k => k || "") || "",
  },
}, { provider: k8sProvider });

// Deployment
const runnerDeployment = new kubernetes.apps.v1.Deployment("runner", {
  metadata: {
    name: resourceName("runner"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "runner",
    },
  },
  spec: {
    replicas: 1,
    selector: {
      matchLabels: {
        ...labels,
        component: "runner",
      },
    },
    template: {
      metadata: {
        labels: {
          ...labels,
          component: "runner",
        },
        annotations: {
          "origan.dev/collect-logs": "true", // Collect logs from runner
        },
      },
      spec: {
        containers: [{
          name: "runner",
          image: runnerImage.imageName,
          ports: [{
            containerPort: 9000,
            name: "http",
          }],
          envFrom: [
            {
              configMapRef: {
                name: runnerConfig.metadata.name,
              },
            },
            {
              secretRef: {
                name: runnerSecret.metadata.name,
              },
            },
          ],
          resources: {
            requests: {
              memory: "256Mi",
              cpu: "100m",
            },
            limits: {
              memory: "512Mi",
              cpu: "300m",
            },
          },
          // Note: Runner uses Supabase Edge Runtime which doesn't have a standard health endpoint
          // The container will be considered ready once it starts listening on the port
        }],
      },
    },
  },
}, { provider: k8sProvider, dependsOn: [runnerImage] });

// Service (internal only, accessed by gateway)
const runnerService = new kubernetes.core.v1.Service("runner-service", {
  metadata: {
    name: resourceName("runner"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "runner",
    },
  },
  spec: {
    selector: {
      ...labels,
      component: "runner",
    },
    ports: [{
      port: 9000,
      targetPort: 9000,
      name: "http",
    }],
    type: "ClusterIP",
  },
}, { provider: k8sProvider, dependsOn: [runnerDeployment] });

// Exports
export const runnerServiceName = runnerService.metadata.name;
export const runnerDeploymentName = runnerDeployment.metadata.name;
export const runnerEndpoint = pulumi.interpolate`http://${runnerService.metadata.name}.${namespaceName_}.svc.cluster.local:9000`;