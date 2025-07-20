import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import type * as scaleway from "@pulumiverse/scaleway";
import { dockerImageWithTag, rn } from "../utils";
import type { BucketConfig } from "./bucket";

interface DeployRunnerOutputs {
  runnerUrl: pulumi.Output<string>;
}

export function deployRunner({
  registry,
  registryApiKey,
  k8sProvider,
  bucketConfig,
  nats,
}: {
  registry: scaleway.registry.Namespace;
  registryApiKey: scaleway.iam.ApiKey;
  k8sProvider: k8s.Provider;
  bucketConfig: BucketConfig;
  nats: {
    endpoint: pulumi.Output<string>;
    creds: pulumi.Output<string>;
  };
}): DeployRunnerOutputs {
  const image = dockerImageWithTag(rn("runner-image"), {
    build: {
      context: "../",
      dockerfile: "../build/docker/prod.Dockerfile",
      platform: "linux/amd64",
      target: "runner",
    },
    imageName: pulumi.interpolate`${registry.endpoint}/runner`,
    registry: {
      server: registry.endpoint,
      username: registryApiKey.accessKey,
      password: registryApiKey.secretKey,
    },
  });

  // Deploy the runner
  // Create deployment first as the service depends on it
  const deployment = new k8s.apps.v1.Deployment(
    rn("k8s-deployment"),
    {
      metadata: {
        name: "runner",
        namespace: "default",
      },
      spec: {
        replicas: 2,
        selector: {
          matchLabels: {
            app: "runner",
          },
        },
        template: {
          metadata: {
            labels: {
              app: "runner",
            },
          },
          spec: {
            containers: [
              {
                name: "runner",
                image: pulumi.interpolate`${registry.endpoint}/runner:${image.digestTag}`,
                ports: [
                  {
                    containerPort: 9000,
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
                  {
                    name: "WORKERS_PATH",
                    value: "/workers",
                  },
                  {
                    name: "EVENTS_NATS_SERVER",
                    value: nats.endpoint,
                  },
                  {
                    name: "EVENTS_NATS_NKEY_CREDS",
                    value: nats.creds,
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

  // Create a LoadBalancer service for the runner
  const runnerService = new k8s.core.v1.Service(
    rn("k8s-service"),
    {
      metadata: {
        name: "runner",
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
            targetPort: 9000,
            protocol: "TCP",
          },
        ],
        selector: {
          app: "runner",
        },
      },
    },
    { provider: k8sProvider, dependsOn: [deployment] },
  );

  return {
    runnerUrl: runnerService.status.loadBalancer.ingress[0].ip,
  };
}
