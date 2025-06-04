import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import type * as scaleway from "@pulumiverse/scaleway";
import { dockerImageWithTag, gan } from "../utils";
import type { BucketConfig } from "./bucket";

export function deployGateway({
  registry,
  registryApiKey,
  k8sProvider,
  bucketConfig,
}: {
  registry: scaleway.registry.Namespace;
  registryApiKey: scaleway.iam.ApiKey;
  k8sProvider: k8s.Provider;
  controlApiUrl: pulumi.Output<string>;
  runnerUrl: pulumi.Output<string>;
  bucketConfig: BucketConfig;
}) {
  const image = dockerImageWithTag(gan("image"), {
    build: {
      context: "../",
      dockerfile: "../dockerfiles/prod.Dockerfile",
      platform: "linux/amd64",
      target: "gateway",
    },
    imageName: pulumi.interpolate`${registry.endpoint}/gateway`,
    registry: {
      server: registry.endpoint,
      username: registryApiKey.accessKey,
      password: registryApiKey.secretKey,
    },
  });

  // Deploy the gateway
  const gatewayDeployment = new k8s.apps.v1.Deployment(
    gan("k8s-deployment"),
    {
      metadata: {
        name: "gateway",
        namespace: "default",
      },
      spec: {
        replicas: 2,
        selector: {
          matchLabels: {
            app: "gateway",
          },
        },
        template: {
          metadata: {
            labels: {
              app: "gateway",
            },
          },
          spec: {
            containers: [
              {
                name: "gateway",
                image: pulumi.interpolate`${registry.endpoint}/gateway:${image.digestTag}`,
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
                volumeMounts: [
                  {
                    name: "tls-cert",
                    mountPath: "/etc/certs",
                    readOnly: true,
                  },
                ],
                env: [
                  {
                    name: "ORIGAN_DEPLOY_DOMAIN",
                    value: "origan.app",
                  },
                  {
                    name: "CONTROL_API_URL",
                    value: "http://control-api",
                  },
                  {
                    name: "RUNNER_URL",
                    value: "http://runner",
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
                    name: "BUCKET_SECRET_KEY",
                    value: bucketConfig.bucketSecretKey,
                  },
                  {
                    name: "BUCKET_REGION",
                    value: bucketConfig.bucketRegion,
                  },
                  {
                    name: "HAS_TLS_SERVER",
                    value: "true",
                  },
                  {
                    name: "TLS_CERT_FILE",
                    value: "/etc/certs/tls.crt",
                  },
                  {
                    name: "TLS_KEY_FILE",
                    value: "/etc/certs/tls.key",
                  },
                ],
              },
            ],
            volumes: [
              {
                name: "tls-cert",
                secret: {
                  secretName: "wildcard-origan-app-tls",
                },
              },
            ],
          },
        },
      },
    },
    { provider: k8sProvider, dependsOn: [image.image] },
  );

  // Create a LoadBalancer service for the gateway
  const gatewayService = new k8s.core.v1.Service(
    gan("k8s-service"),
    {
      metadata: {
        name: "gateway",
        namespace: "default",
        annotations: {
          "pulumi.com/skipAwait": "true", // Allow the service to be created before pods are ready
          "service.beta.kubernetes.io/scw-loadbalancer-use-hostname": "true",
          "service.beta.kubernetes.io/scw-loadbalancer-type": "lb-s", // Use small loadbalancer
        },
      },
      spec: {
        type: "LoadBalancer",
        ports: [
          {
            port: 80,
            targetPort: 7777,
            protocol: "TCP",
            name: "http",
          },
          {
            port: 443,
            targetPort: 7778, // Match the HTTPS server port
            protocol: "TCP",
            name: "https",
          },
        ],
        selector: {
          app: "gateway",
        },
      },
    },
    { provider: k8sProvider },
  );

  return {
    image,
    gatewayService,
  };
}
