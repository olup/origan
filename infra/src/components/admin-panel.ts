import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import type * as scaleway from "@pulumiverse/scaleway";
import { adminNamespace, dockerImageWithTag } from "../utils";

export function deployAdminPanel({
  registry,
  registryApiKey,
  k8sProvider,
}: {
  registry: scaleway.registry.Namespace;
  registryApiKey: scaleway.iam.ApiKey;
  k8sProvider: k8s.Provider;
}) {
  const image = dockerImageWithTag(adminNamespace("admin-panel-image"), {
    build: {
      context: "../",
      dockerfile: "../dockerfiles/prod.Dockerfile",
      target: "admin-panel",
      platform: "linux/amd64",
    },
    imageName: pulumi.interpolate`${registry.endpoint}/admin-panel`,
    registry: {
      server: registry.endpoint,
      username: registryApiKey.accessKey,
      password: registryApiKey.secretKey,
    },
  });

  const adminPanelDeployment = new k8s.apps.v1.Deployment(
    adminNamespace("k8s-admin-panel-deployment"),
    {
      metadata: {
        name: "admin-panel",
        namespace: "default",
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: {
            app: "admin-panel",
          },
        },
        template: {
          metadata: {
            labels: {
              app: "admin-panel",
            },
          },
          spec: {
            containers: [
              {
                name: "admin-panel",
                image: pulumi.interpolate`${registry.endpoint}/admin-panel:${image.digestTag}`,
                ports: [
                  {
                    containerPort: 80,
                  },
                ],
                resources: {
                  requests: {
                    cpu: "50m",
                    memory: "64Mi",
                  },
                  limits: {
                    cpu: "100m",
                    memory: "128Mi",
                  },
                },
                env: [
                  {
                    name: "NGINX_ENTRYPOINT_QUIET_LOGS",
                    value: "1",
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

  const adminPanelService = new k8s.core.v1.Service(
    adminNamespace("k8s-admin-panel-service"),
    {
      metadata: {
        name: "admin-panel",
        namespace: "default",
      },
      spec: {
        type: "ClusterIP",
        ports: [
          {
            port: 80,
            targetPort: 80,
            protocol: "TCP",
          },
        ],
        selector: {
          app: "admin-panel",
        },
      },
    },
    { provider: k8sProvider },
  );

  return {
    adminPanelUrl: pulumi.output("https://app.origan.dev"),
    deployment: adminPanelDeployment,
    service: adminPanelService,
  };
}
