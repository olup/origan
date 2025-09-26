import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import * as docker from "@pulumi/docker";
import { k8sProvider, dockerProvider } from "../providers.js";
import { namespaceName_ } from "../core/namespace.js";
import { 
  deploymentBucketName, 
  garageEndpointInternal,
  garageAccessKeyValue,
  garageSecretKeyValue,
} from "../core/garage.js";
import { runnerEndpoint } from "./runner.js";
import { controlApiServiceName } from "./control-api.js";
import { 
  resourceName, 
  labels, 
  gatewayUrl,
  imageTag,
  registryEndpoint,
  garageAccessKey,
  garageSecretKey,
} from "../config.js";

// Build Docker image
export const gatewayImage = new docker.Image("gateway-image", {
  imageName: pulumi.interpolate`${registryEndpoint}/origan/gateway:${imageTag}`,
  build: {
    context: "../../", // Monorepo root
    dockerfile: "../../build/docker/prod-optimized.Dockerfile",
    target: "gateway", // Use gateway stage from multi-stage build
    platform: "linux/amd64",
  },
  skipPush: false,
}, { provider: dockerProvider });

// ConfigMap
const gatewayConfig = new kubernetes.core.v1.ConfigMap("gateway-config", {
  metadata: {
    name: resourceName("gateway-config"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "gateway",
    },
  },
  data: {
    NODE_ENV: "production",
    PORT: "8080",
    BUCKET_NAME: deploymentBucketName,
    BUCKET_URL: garageEndpointInternal,
    BUCKET_REGION: "garage",
    CONTROL_API_URL: pulumi.interpolate`http://${controlApiServiceName}.${namespaceName_}.svc.cluster.local:3001`,
    RUNNER_URL: runnerEndpoint,
  },
}, { provider: k8sProvider });

// Secret
const gatewaySecret = new kubernetes.core.v1.Secret("gateway-secret", {
  metadata: {
    name: resourceName("gateway-secret"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "gateway",
    },
  },
  stringData: {
    BUCKET_ACCESS_KEY: garageAccessKeyValue || "",
    BUCKET_SECRET_KEY: garageSecretKeyValue?.apply(k => k || "") || "",
  },
}, { provider: k8sProvider });

// Deployment
const gatewayDeployment = new kubernetes.apps.v1.Deployment("gateway", {
  metadata: {
    name: resourceName("gateway"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "gateway",
    },
  },
  spec: {
    replicas: 1,
    selector: {
      matchLabels: {
        ...labels,
        component: "gateway",
      },
    },
    template: {
      metadata: {
        labels: {
          ...labels,
          component: "gateway",
        },
      },
      spec: {
        containers: [{
          name: "gateway",
          image: gatewayImage.imageName,
          ports: [{
            containerPort: 8080,
            name: "http",
          }],
          envFrom: [
            {
              configMapRef: {
                name: gatewayConfig.metadata.name,
              },
            },
            {
              secretRef: {
                name: gatewaySecret.metadata.name,
              },
            },
          ],
          resources: {
            requests: {
              memory: "128Mi",
              cpu: "50m",
            },
            limits: {
              memory: "256Mi",
              cpu: "200m",
            },
          },
          livenessProbe: {
            httpGet: {
              path: "/health",
              port: 8080,
            },
            initialDelaySeconds: 20,
            periodSeconds: 10,
          },
          readinessProbe: {
            httpGet: {
              path: "/health",
              port: 8080,
            },
            initialDelaySeconds: 10,
            periodSeconds: 5,
          },
        }],
      },
    },
  },
}, { provider: k8sProvider, dependsOn: [gatewayImage] });

// Service
const gatewayService = new kubernetes.core.v1.Service("gateway-service", {
  metadata: {
    name: resourceName("gateway"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "gateway",
    },
  },
  spec: {
    selector: {
      ...labels,
      component: "gateway",
    },
    ports: [{
      port: 80,
      targetPort: 8080,
      name: "http",
    }],
    type: "ClusterIP",
  },
}, { provider: k8sProvider, dependsOn: [gatewayDeployment] });

// Wildcard Ingress for user deployments
const gatewayIngress = new kubernetes.networking.v1.Ingress("gateway-ingress", {
  metadata: {
    name: resourceName("gateway"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "gateway",
    },
    annotations: {
      "kubernetes.io/ingress.class": "traefik",
      "cert-manager.io/cluster-issuer": "letsencrypt-prod",
    },
  },
  spec: {
    tls: [{
      hosts: [gatewayUrl],
      secretName: resourceName("gateway-tls"),
    }],
    rules: [{
      host: gatewayUrl,
      http: {
        paths: [{
          path: "/",
          pathType: "Prefix",
          backend: {
            service: {
              name: gatewayService.metadata.name,
              port: {
                number: 80,
              },
            },
          },
        }],
      },
    }],
  },
}, { provider: k8sProvider });

// Exports
export const gatewayServiceName = gatewayService.metadata.name;
export const gatewayDeploymentName = gatewayDeployment.metadata.name;
export const gatewayWildcardDomain = gatewayUrl;