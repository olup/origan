import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as scaleway from "@pulumiverse/scaleway";
import { dockerImageWithTag, rn } from "../utils";
import { BucketConfig } from "./bucket";

interface DeployRunnerOutputs {
  runnerUrl: pulumi.Output<string>;
}

export function deployRunner({
  registry,
  registryApiKey,
  k8sProvider,
  bucketConfig,
}: {
  registry: scaleway.registry.Namespace;
  registryApiKey: scaleway.iam.ApiKey;
  k8sProvider: k8s.Provider;
  bucketConfig: BucketConfig;
}): DeployRunnerOutputs {
  const image = dockerImageWithTag(rn("runner-image"), {
    build: {
      context: "../",
      dockerfile: "../Dockerfile",
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
  const runnerDeployment = new k8s.apps.v1.Deployment(
    "runner",
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
                ],
              },
            ],
          },
        },
      },
    },
    { provider: k8sProvider, dependsOn: [image.image] }
  );

  // Create a LoadBalancer service for the runner
  const runnerService = new k8s.core.v1.Service(
    "runner",
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
    { provider: k8sProvider }
  );

  return {
    runnerUrl: runnerService.status.loadBalancer.ingress[0].ip,
  };
}
