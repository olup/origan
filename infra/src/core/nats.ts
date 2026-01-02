import * as kubernetes from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { labels, resourceName } from "../config.js";
import { k8sProvider } from "../providers.js";
import { namespaceName_ } from "./namespace.js";

// NATS ConfigMap for JetStream configuration
const natsConfigMap = new kubernetes.core.v1.ConfigMap(
  "nats-config",
  {
    metadata: {
      name: resourceName("nats-config"),
      namespace: namespaceName_,
      labels: {
        ...labels,
        component: "nats",
      },
    },
    data: {
      "nats.conf": `
port: 4222
monitor_port: 8222

jetstream {
  store_dir: /data/jetstream
  max_mem: 1G
  max_file: 10G
}

websocket {
  port: 4223
  no_tls: true
}
    `,
    },
  },
  { provider: k8sProvider },
);

// NATS StatefulSet with persistent storage
const natsStatefulSet = new kubernetes.apps.v1.StatefulSet(
  "nats",
  {
    metadata: {
      name: resourceName("nats"),
      namespace: namespaceName_,
      labels: {
        ...labels,
        component: "nats",
      },
    },
    spec: {
      serviceName: resourceName("nats"),
      replicas: 1,
      selector: {
        matchLabels: {
          ...labels,
          component: "nats",
        },
      },
      template: {
        metadata: {
          labels: {
            ...labels,
            component: "nats",
          },
        },
        spec: {
          containers: [
            {
              name: "nats",
              image: "nats:2.10-alpine",
              ports: [
                { containerPort: 4222, name: "client" },
                { containerPort: 4223, name: "ws" },
                { containerPort: 8222, name: "monitor" },
              ],
              command: ["nats-server"],
              args: ["-c", "/etc/nats/nats.conf"],
              volumeMounts: [
                {
                  name: "config",
                  mountPath: "/etc/nats",
                },
                {
                  name: "jetstream",
                  mountPath: "/data",
                },
              ],
              resources: {
                requests: {
                  memory: "128Mi",
                  cpu: "50m",
                },
                limits: {
                  memory: "256Mi",
                  cpu: "100m",
                },
              },
              livenessProbe: {
                httpGet: {
                  path: "/healthz",
                  port: 8222,
                },
                initialDelaySeconds: 10,
                periodSeconds: 10,
              },
              readinessProbe: {
                httpGet: {
                  path: "/healthz",
                  port: 8222,
                },
                initialDelaySeconds: 5,
                periodSeconds: 5,
              },
            },
          ],
          volumes: [
            {
              name: "config",
              configMap: {
                name: natsConfigMap.metadata.name,
              },
            },
          ],
        },
      },
      volumeClaimTemplates: [
        {
          metadata: {
            name: "jetstream",
          },
          spec: {
            accessModes: ["ReadWriteOnce"],
            resources: {
              requests: {
                storage: "2Gi",
              },
            },
          },
        },
      ],
    },
  },
  { provider: k8sProvider },
);

// NATS Service
const natsService = new kubernetes.core.v1.Service(
  "nats-service",
  {
    metadata: {
      name: resourceName("nats"),
      namespace: namespaceName_,
      labels: {
        ...labels,
        component: "nats",
      },
    },
    spec: {
      selector: {
        ...labels,
        component: "nats",
      },
      ports: [
        { port: 4222, targetPort: 4222, name: "client" },
        { port: 4223, targetPort: 4223, name: "ws" },
        { port: 8222, targetPort: 8222, name: "monitor" },
      ],
      type: "ClusterIP",
    },
  },
  { provider: k8sProvider, dependsOn: [natsStatefulSet] },
);

// Export connection details
export const natsEndpoint = pulumi.interpolate`nats://${natsService.metadata.name}.${namespaceName_}.svc.cluster.local:4222`;
export const natsMonitorEndpoint = pulumi.interpolate`http://${natsService.metadata.name}.${namespaceName_}.svc.cluster.local:8222`;
export const natsWsEndpoint = pulumi.interpolate`ws://${natsService.metadata.name}.${namespaceName_}.svc.cluster.local:4223`;
export const natsServiceName = natsService.metadata.name;
