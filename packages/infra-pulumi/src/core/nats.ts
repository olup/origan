import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import { k8sProvider } from "../providers.js";
import { namespaceName_ } from "./namespace.js";
import { natsConfig, resourceName, labels } from "../config.js";

// NATS ConfigMap for JetStream configuration
const natsConfigMap = new kubernetes.core.v1.ConfigMap("nats-config", {
  metadata: {
    name: resourceName("nats-config"),
    namespace: namespaceName_,
    labels: labels,
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
      
      cluster {
        name: origan-nats
        port: 6222
      }
    `,
  },
}, { provider: k8sProvider });

// NATS PVC for JetStream storage
const natsPVC = new kubernetes.core.v1.PersistentVolumeClaim("nats-pvc", {
  metadata: {
    name: resourceName("nats-pvc"),
    namespace: namespaceName_,
    labels: labels,
  },
  spec: {
    accessModes: ["ReadWriteOnce"],
    resources: {
      requests: {
        storage: natsConfig.storageSize,
      },
    },
  },
}, { provider: k8sProvider });

// NATS StatefulSet
const natsStatefulSet = new kubernetes.apps.v1.StatefulSet("nats", {
  metadata: {
    name: resourceName("nats"),
    namespace: namespaceName_,
    labels: labels,
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
        containers: [{
          name: "nats",
          image: `nats:${natsConfig.version}`,
          ports: [
            {
              containerPort: 4222,
              name: "client",
            },
            {
              containerPort: 6222,
              name: "cluster",
            },
            {
              containerPort: 8222,
              name: "monitor",
            },
          ],
          command: ["nats-server"],
          args: ["-c", "/etc/nats/nats.conf"],
          volumeMounts: [
            {
              name: "config",
              mountPath: "/etc/nats",
            },
            {
              name: "data",
              mountPath: "/data",
            },
          ],
          livenessProbe: {
            httpGet: {
              path: "/",
              port: 8222,
            },
            initialDelaySeconds: 10,
            periodSeconds: 10,
          },
          readinessProbe: {
            httpGet: {
              path: "/",
              port: 8222,
            },
            initialDelaySeconds: 5,
            periodSeconds: 5,
          },
        }],
        volumes: [
          {
            name: "config",
            configMap: {
              name: natsConfigMap.metadata.name,
            },
          },
          {
            name: "data",
            persistentVolumeClaim: {
              claimName: natsPVC.metadata.name,
            },
          },
        ],
      },
    },
  },
}, { provider: k8sProvider });

// NATS Service
const natsService = new kubernetes.core.v1.Service("nats-service", {
  metadata: {
    name: resourceName("nats"),
    namespace: namespaceName_,
    labels: labels,
  },
  spec: {
    selector: {
      ...labels,
      component: "nats",
    },
    ports: [
      {
        port: 4222,
        targetPort: 4222,
        name: "client",
      },
      {
        port: 6222,
        targetPort: 6222,
        name: "cluster",
      },
      {
        port: 8222,
        targetPort: 8222,
        name: "monitor",
      },
    ],
    type: "ClusterIP",
  },
}, { provider: k8sProvider });

// Export connection details
export const natsEndpoint = pulumi.interpolate`nats://${natsService.metadata.name}.${namespaceName_}.svc.cluster.local:4222`;
export const natsMonitorEndpoint = pulumi.interpolate`http://${natsService.metadata.name}.${namespaceName_}.svc.cluster.local:8222`;