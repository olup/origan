import * as kubernetes from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { dbConfig, labels, postgresPassword, resourceName } from "../config.js";
import { k8sProvider } from "../providers.js";
import { namespaceName_ } from "./namespace.js";

// PostgreSQL ConfigMap
const postgresConfigMap = new kubernetes.core.v1.ConfigMap(
  "postgres-config",
  {
    metadata: {
      name: resourceName("postgres-config"),
      namespace: namespaceName_,
      labels: {
        ...labels,
        component: "postgres",
      },
    },
    data: {
      POSTGRES_DB: dbConfig.name,
      POSTGRES_USER: dbConfig.user,
      PGDATA: "/var/lib/postgresql/data/pgdata",
    },
  },
  { provider: k8sProvider },
);

// PostgreSQL Secret
const postgresSecret = new kubernetes.core.v1.Secret(
  "postgres-secret",
  {
    metadata: {
      name: resourceName("postgres-secret"),
      namespace: namespaceName_,
      labels: {
        ...labels,
        component: "postgres",
      },
    },
    stringData: {
      POSTGRES_PASSWORD: postgresPassword,
    },
  },
  { provider: k8sProvider },
);

// PostgreSQL StatefulSet
const postgresStatefulSet = new kubernetes.apps.v1.StatefulSet(
  "postgres",
  {
    metadata: {
      name: resourceName("postgres"),
      namespace: namespaceName_,
      labels: {
        ...labels,
        component: "postgres",
      },
    },
    spec: {
      serviceName: resourceName("postgres"),
      replicas: 1,
      selector: {
        matchLabels: {
          ...labels,
          component: "postgres",
        },
      },
      template: {
        metadata: {
          labels: {
            ...labels,
            component: "postgres",
          },
        },
        spec: {
          containers: [
            {
              name: "postgres",
              image: `postgres:${dbConfig.version}-alpine`,
              ports: [
                {
                  containerPort: 5432,
                  name: "postgres",
                },
              ],
              envFrom: [
                {
                  configMapRef: {
                    name: postgresConfigMap.metadata.name,
                  },
                },
                {
                  secretRef: {
                    name: postgresSecret.metadata.name,
                  },
                },
              ],
              volumeMounts: [
                {
                  name: "postgres-storage",
                  mountPath: "/var/lib/postgresql/data",
                },
              ],
              resources: {
                requests: {
                  memory: "256Mi",
                  cpu: "100m",
                },
                limits: {
                  memory: "512Mi",
                  cpu: "200m",
                },
              },
              livenessProbe: {
                exec: {
                  command: [
                    "pg_isready",
                    "-U",
                    dbConfig.user,
                    "-d",
                    dbConfig.name,
                  ],
                },
                initialDelaySeconds: 30,
                periodSeconds: 10,
              },
              readinessProbe: {
                exec: {
                  command: [
                    "pg_isready",
                    "-U",
                    dbConfig.user,
                    "-d",
                    dbConfig.name,
                  ],
                },
                initialDelaySeconds: 5,
                periodSeconds: 5,
              },
            },
          ],
        },
      },
      volumeClaimTemplates: [
        {
          metadata: {
            name: "postgres-storage",
          },
          spec: {
            accessModes: ["ReadWriteOnce"],
            resources: {
              requests: {
                storage: dbConfig.storageSize,
              },
            },
          },
        },
      ],
    },
  },
  { provider: k8sProvider },
);

// PostgreSQL Service
const postgresService = new kubernetes.core.v1.Service(
  "postgres-service",
  {
    metadata: {
      name: resourceName("postgres"),
      namespace: namespaceName_,
      labels: {
        ...labels,
        component: "postgres",
      },
    },
    spec: {
      selector: {
        ...labels,
        component: "postgres",
      },
      ports: [
        {
          port: 5432,
          targetPort: 5432,
          name: "postgres",
        },
      ],
      type: "ClusterIP",
    },
  },
  { provider: k8sProvider, dependsOn: [postgresStatefulSet] },
);

// Export connection details
export const postgresEndpoint = pulumi.interpolate`${postgresService.metadata.name}.${namespaceName_}.svc.cluster.local:5432`;
export const postgresConnectionString = pulumi.interpolate`postgresql://${dbConfig.user}:${postgresPassword}@${postgresService.metadata.name}.${namespaceName_}.svc.cluster.local:5432/${dbConfig.name}`;
export const postgresServiceName = postgresService.metadata.name;
export const postgresSecretName = postgresSecret.metadata.name;
