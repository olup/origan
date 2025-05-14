import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import type * as scaleway from "@pulumiverse/scaleway";
import { config } from "../config";
import { cn, dockerImageWithTag } from "../utils";
import type { BucketConfig } from "./bucket";
import type { DatabaseOutputs } from "./database";

export function deployControl({
  registry,
  registryApiKey,
  k8sProvider,
  db,
  bucketConfig,
  nginxIngress,
  buildRunnerImage,
}: {
  registry: scaleway.registry.Namespace;
  registryApiKey: scaleway.iam.ApiKey;
  k8sProvider: k8s.Provider;
  db: DatabaseOutputs;
  bucketConfig: BucketConfig;
  nginxIngress: k8s.helm.v3.Release;
  buildRunnerImage: pulumi.Output<string>;
}) {
  // Generate a secure JWT secret
  const jwtSecret = new random.RandomPassword(cn("jwt-secret"), {
    length: 48,
    special: true,
  });

  const image = dockerImageWithTag(cn("image"), {
    build: {
      context: "../",
      dockerfile: "../Dockerfile",
      platform: "linux/amd64",
      target: "control-api",
    },
    imageName: pulumi.interpolate`${registry.endpoint}/control-api`,
    registry: {
      server: registry.endpoint,
      username: registryApiKey.accessKey,
      password: registryApiKey.secretKey,
    },
  });

  // Deploy the control API
  const controlDeployment = new k8s.apps.v1.Deployment(
    cn("k8s-api-deployment"),
    {
      metadata: {
        name: "control-api",
        namespace: "default",
      },
      spec: {
        replicas: 2,
        selector: {
          matchLabels: {
            app: "control-api",
          },
        },
        template: {
          metadata: {
            labels: {
              app: "control-api",
            },
          },
          spec: {
            containers: [
              {
                name: "control",
                image: pulumi.interpolate`${registry.endpoint}/control-api:${image.digestTag}`,
                ports: [
                  {
                    containerPort: 9999,
                  },
                ],
                resources: {
                  requests: {
                    cpu: "100m",
                    memory: "128Mi",
                  },
                  limits: {
                    cpu: "200m",
                    memory: "256Mi",
                  },
                },
                env: [
                  {
                    name: "APP_ENV",
                    value: "production",
                  },
                  {
                    name: "BUILD_RUNNER_IMAGE",
                    value: buildRunnerImage,
                  },
                  {
                    name: "DATABASE_RUN_MIGRATIONS",
                    value: "true",
                  },
                  {
                    name: "DATABASE_URL",
                    value: pulumi.interpolate`postgresql://${
                      db.user
                    }:${db.password.apply(encodeURIComponent)}@${db.host}:${
                      db.port
                    }/${db.database}`,
                  },
                  {
                    name: "ORIGAN_DEPLOY_DOMAIN",
                    value: "origan.app",
                  },
                  {
                    name: "ORIGAN_ADMIN_PANEL_URL",
                    value: "app.origan.dev",
                  },
                  {
                    name: "ORIGAN_API_URL",
                    value: "https://api.origan.dev",
                  },
                  {
                    name: "BUCKET_URL",
                    value: bucketConfig.bucketUrl,
                  },
                  {
                    name: "BUCKET_NAME",
                    value: bucketConfig.bucketName,
                  },
                  {
                    name: "BUCKET_ACCESS_KEY",
                    value: bucketConfig.bucketAccessKey,
                  },
                  {
                    name: "BUCKET_REGION",
                    value: bucketConfig.bucketRegion,
                  },
                  {
                    name: "BUCKET_SECRET_KEY",
                    value: bucketConfig.bucketSecretKey,
                  },
                  // GitHub OAuth Configuration
                  {
                    name: "GITHUB_CLIENT_ID",
                    value: config.github.clientId,
                  },
                  {
                    name: "GITHUB_CLIENT_SECRET",
                    value: config.github.clientSecret,
                  },
                  {
                    name: "GITHUB_WEBHOOK_SECRET",
                    value: config.github.webhookSecret,
                  },
                  {
                    name: "GITHUB_APP_ID",
                    value: config.github.appId,
                  },
                  {
                    name: "GITHUB_APP_PRIVATE_KEY_BASE64",
                    value: config.github.appPrivateKeyBase64,
                  },
                  // JWT Configuration
                  {
                    name: "JWT_SECRET",
                    value: jwtSecret.result,
                  },
                ],
              },
            ],
          },
        },
      },
    },
    { provider: k8sProvider, dependsOn: [image.image] },
  );

  // Create a LoadBalancer service for the control API
  const controlService = new k8s.core.v1.Service(
    cn("k8s-api-service"),
    {
      metadata: {
        name: "control-api",
        namespace: "default",
        annotations: {
          "pulumi.com/skipAwait": "true",
        },
      },
      spec: {
        type: "ClusterIP",
        ports: [
          {
            port: 80,
            targetPort: 9999,
            protocol: "TCP",
          },
        ],
        selector: {
          app: "control-api",
        },
      },
    },
    { provider: k8sProvider },
  );

  // Configure ingress with proper service routing using control service name
  const ingress = new k8s.networking.v1.Ingress(
    cn("k8s-api-ingress"),
    {
      metadata: {
        name: "main-ingress",
        annotations: {
          "cert-manager.io/cluster-issuer": "letsencrypt-prod",
          "nginx.ingress.kubernetes.io/ssl-redirect": "false",
          "nginx.ingress.kubernetes.io/force-ssl-redirect": "false",
          "nginx.ingress.kubernetes.io/proxy-body-size": "100m",
        },
      },
      spec: {
        ingressClassName: "nginx",
        tls: [
          {
            hosts: ["api.origan.dev"],
            secretName: "api-origan-tls", // cert-manager will create this
          },
        ],
        rules: [
          {
            host: "api.origan.dev",
            http: {
              paths: [
                {
                  path: "/",
                  pathType: "Prefix",
                  backend: {
                    service: {
                      name: controlService.metadata.name,
                      port: { number: 80 },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
    { provider: k8sProvider, dependsOn: [nginxIngress, controlService] },
  );

  return {
    apiUrl: pulumi.output("https://api.origan.dev"),
  };
}
