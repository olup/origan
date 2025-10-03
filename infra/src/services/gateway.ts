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
    context: "..", // Monorepo root (from infra directory)
    dockerfile: "../docker/prod-optimized.Dockerfile",
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
    PORT: "7777",
    ORIGAN_DEPLOY_DOMAIN: "origan.app",
    CONTROL_API_URL: pulumi.interpolate`http://${controlApiServiceName}.${namespaceName_}.svc.cluster.local:80`,
    RUNNER_URL: runnerEndpoint,
    BUCKET_NAME: deploymentBucketName,
    BUCKET_URL: garageEndpointInternal,
    BUCKET_REGION: "garage",
    HAS_TLS_SERVER: "true", // Gateway handles TLS termination for wildcard domain
    TLS_CERT_FILE: "/etc/tls/tls.crt", // Mounted from wildcard-tls secret
    TLS_KEY_FILE: "/etc/tls/tls.key", // Mounted from wildcard-tls secret
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
        annotations: {
          "origan.dev/collect-logs": "true",
        },
      },
      spec: {
        volumes: [{
          name: "tls-certs",
          secret: {
            secretName: "wildcard-tls", // Manual secret with *.origan.app certificate
            optional: true, // Don't fail if secret doesn't exist yet
          },
        }],
        containers: [{
          name: "gateway",
          image: gatewayImage.imageName,
          ports: [
            {
              containerPort: 7777,
              name: "http",
            },
            {
              containerPort: 7778,
              name: "https",
            },
          ],
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
          volumeMounts: [{
            name: "tls-certs",
            mountPath: "/etc/tls",
            readOnly: true,
          }],
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
              port: 7777,
            },
            initialDelaySeconds: 30,
            periodSeconds: 30,
          },
          readinessProbe: {
            httpGet: {
              path: "/health",
              port: 7777,
            },
            initialDelaySeconds: 10,
            periodSeconds: 10,
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
    ports: [
      {
        port: 80,
        targetPort: 7777,
        name: "http",
      },
      {
        port: 443,
        targetPort: 7778,
        name: "https",
      },
    ],
    type: "ClusterIP",
  },
}, { provider: k8sProvider, dependsOn: [gatewayDeployment] });

// TCP passthrough for HTTPS (gateway handles TLS termination)
const gatewayIngressRouteTCP = new kubernetes.apiextensions.CustomResource("gateway-ingress-tcp", {
  apiVersion: "traefik.io/v1alpha1",
  kind: "IngressRouteTCP",
  metadata: {
    name: resourceName("gateway-tcp"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "gateway",
    },
  },
  spec: {
    entryPoints: ["websecure"],
    routes: [{
      match: `HostSNIRegexp(\`^.+\\.origan\\.app$\`)`,
      services: [{
        name: gatewayService.metadata.name,
        port: 443,
      }],
    }],
    tls: {
      passthrough: true,
    },
  },
}, { provider: k8sProvider });

// HTTP ingress (redirect to HTTPS or handle HTTP)
const gatewayIngressHTTP = new kubernetes.networking.v1.Ingress("gateway-ingress-http", {
  metadata: {
    name: resourceName("gateway-http"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "gateway",
    },
    annotations: {
      "kubernetes.io/ingress.class": "traefik",
    },
  },
  spec: {
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