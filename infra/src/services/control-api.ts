import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import * as docker from "@pulumi/docker";
import * as crypto from "crypto";
import { k8sProvider, dockerProvider } from "../providers.js";
import { namespaceName_ } from "../core/namespace.js";
import { postgresConnectionString } from "../core/database.js";
import { natsEndpoint } from "../core/nats.js";
import { 
  deploymentBucketName, 
  garageEndpointInternal,
  garageAccessKeyValue,
  garageSecretKeyValue,
} from "../core/garage.js";
import { registryEndpointInternal } from "../core/registry.js";
import { builderImageUrl } from "./builder.js";
import { 
  resourceName, 
  labels, 
  apiUrl, 
  imageTag, 
  registryEndpoint,
} from "../config.js";

// Get GitHub configuration from Pulumi config
const config = new pulumi.Config();
const githubAppId = config.get("github.appId") || "";
const githubClientId = config.get("github.clientId") || "";
const githubClientSecret = config.getSecret("github.clientSecret") || "";
const githubAppPrivateKey = config.getSecret("github.appPrivateKey") || "";
const githubWebhookSecret = config.getSecret("github.webhookSecret") || "";

// Get ACME configuration from Pulumi config (optional for now)
const acmeAccountKey = config.getSecret("acme.accountKey") || pulumi.output("");

// Create ServiceAccount for control-api
const serviceAccount = new kubernetes.core.v1.ServiceAccount("control-api-sa", {
  metadata: {
    name: resourceName("control-api-sa"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "control-api",
    },
  },
}, { provider: k8sProvider });

// Create ClusterRole for control-api to manage jobs
const clusterRole = new kubernetes.rbac.v1.ClusterRole("control-api-role", {
  metadata: {
    name: resourceName("control-api-job-manager"),
    labels: {
      ...labels,
      component: "control-api",
    },
  },
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
}, { provider: k8sProvider });

// Create ClusterRoleBinding
const clusterRoleBinding = new kubernetes.rbac.v1.ClusterRoleBinding("control-api-binding", {
  metadata: {
    name: resourceName("control-api-binding"),
    labels: {
      ...labels,
      component: "control-api",
    },
  },
  roleRef: {
    apiGroup: "rbac.authorization.k8s.io",
    kind: "ClusterRole",
    name: clusterRole.metadata.name,
  },
  subjects: [{
    kind: "ServiceAccount",
    name: serviceAccount.metadata.name,
    namespace: namespaceName_,
  }],
}, { provider: k8sProvider });

// Build Docker image
export const controlApiImage = new docker.Image("control-api-image", {
  imageName: pulumi.interpolate`${registryEndpoint}/origan/control-api:${imageTag}`,
  build: {
    context: "..", // Monorepo root (from infra directory)
    dockerfile: "../docker/prod-optimized.Dockerfile",
    target: "control-api", // Use control-api stage from multi-stage build
    platform: "linux/amd64",
  },
  skipPush: false,
}, { provider: dockerProvider });

// Environment variables ConfigMap
const controlApiConfig = new kubernetes.core.v1.ConfigMap("control-api-config", {
  metadata: {
    name: resourceName("control-api-config"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "control-api",
    },
  },
  data: {
    NODE_ENV: "production",
    PORT: "3001",
    BUCKET_NAME: deploymentBucketName,
    KUBERNETES_MODE: "in-cluster",
    ORIGAN_DEPLOY_DOMAIN: "origan.app",
    ORIGAN_API_URL: `https://${apiUrl}`,
    ORIGAN_ADMIN_PANEL_URL: "https://admin.origan.dev",
    DATABASE_RUN_MIGRATIONS: "true",
    GATEWAY_HOSTNAME: "gateway.origan.app",
  },
}, { provider: k8sProvider });

// Secrets
const controlApiSecret = new kubernetes.core.v1.Secret("control-api-secret", {
  metadata: {
    name: resourceName("control-api-secret"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "control-api",
    },
  },
  stringData: {
    APP_ENV: "production",
    DATABASE_URL: postgresConnectionString,
    EVENTS_NATS_SERVER: natsEndpoint,
    BUCKET_URL: garageEndpointInternal,
    BUCKET_ACCESS_KEY: garageAccessKeyValue || "",
    BUCKET_SECRET_KEY: garageSecretKeyValue?.apply(k => k || "") || "",
    BUCKET_REGION: "garage",
    JWT_SECRET: crypto.randomBytes(32).toString("hex"),
    GITHUB_CLIENT_ID: githubClientId,
    GITHUB_CLIENT_SECRET: githubClientSecret,
    GITHUB_APP_ID: githubAppId,
    GITHUB_APP_PRIVATE_KEY_BASE64: githubAppPrivateKey,
    GITHUB_WEBHOOK_SECRET: githubWebhookSecret,
    DOCKER_REGISTRY: registryEndpointInternal,
    BUILDER_IMAGE: builderImageUrl,
    K8S_NAMESPACE: namespaceName_,
    ACME_ACCOUNT_KEY: acmeAccountKey,
  },
}, { provider: k8sProvider });

// Deployment
const controlApiDeployment = new kubernetes.apps.v1.Deployment("control-api", {
  metadata: {
    name: resourceName("control-api"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "control-api",
    },
  },
  spec: {
    replicas: 1,
    selector: {
      matchLabels: {
        ...labels,
        component: "control-api",
      },
    },
    template: {
      metadata: {
        labels: {
          ...labels,
          component: "control-api",
        },
        annotations: {
          "origan.dev/collect-logs": "true",
        },
      },
      spec: {
        serviceAccountName: serviceAccount.metadata.name,
        containers: [{
          name: "control-api",
          image: controlApiImage.imageName,
          ports: [{
            containerPort: 3001,
            name: "http",
          }],
          envFrom: [
            {
              configMapRef: {
                name: controlApiConfig.metadata.name,
              },
            },
            {
              secretRef: {
                name: controlApiSecret.metadata.name,
              },
            },
          ],
          resources: {
            requests: {
              memory: "512Mi",
              cpu: "100m",
            },
            limits: {
              memory: "1Gi",
              cpu: "500m",
            },
          },
          livenessProbe: {
            httpGet: {
              path: "/.healthz",
              port: 3001,
            },
            initialDelaySeconds: 30,
            periodSeconds: 10,
          },
          readinessProbe: {
            httpGet: {
              path: "/.healthz",
              port: 3001,
            },
            initialDelaySeconds: 10,
            periodSeconds: 5,
          },
        }],
      },
    },
  },
}, { provider: k8sProvider, dependsOn: [controlApiImage] });

// Service
const controlApiService = new kubernetes.core.v1.Service("control-api-service", {
  metadata: {
    name: resourceName("control-api"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "control-api",
    },
  },
  spec: {
    selector: {
      ...labels,
      component: "control-api",
    },
    ports: [{
      port: 80,
      targetPort: 3001,
      name: "http",
    }],
    type: "ClusterIP",
  },
}, { provider: k8sProvider, dependsOn: [controlApiDeployment] });

// Ingress
const controlApiIngress = new kubernetes.networking.v1.Ingress("control-api-ingress", {
  metadata: {
    name: resourceName("control-api"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "control-api",
    },
    annotations: {
      "kubernetes.io/ingress.class": "traefik",
      "cert-manager.io/cluster-issuer": "letsencrypt-prod",
    },
  },
  spec: {
    tls: [{
      hosts: [apiUrl],
      secretName: resourceName("control-api-tls"),
    }],
    rules: [{
      host: apiUrl,
      http: {
        paths: [{
          path: "/",
          pathType: "Prefix",
          backend: {
            service: {
              name: controlApiService.metadata.name,
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
export const controlApiUrl = pulumi.interpolate`https://${apiUrl}`;
export const controlApiServiceName = controlApiService.metadata.name;
export const controlApiDeploymentName = controlApiDeployment.metadata.name;