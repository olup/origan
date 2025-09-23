import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import { k8sProvider } from "../providers.js";
import { namespaceName_ } from "./namespace.js";
import { dbConfig, resourceName, labels } from "../config.js";

// PostgreSQL Secret
const postgresSecret = new kubernetes.core.v1.Secret("postgres-secret", {
  metadata: {
    name: resourceName("postgres-secret"),
    namespace: namespaceName_,
    labels: labels,
  },
  stringData: {
    "POSTGRES_DB": dbConfig.name,
    "POSTGRES_USER": dbConfig.user,
    "POSTGRES_PASSWORD": dbConfig.password.apply(p => p),
  },
}, { provider: k8sProvider });

// PostgreSQL PVC
const postgresPVC = new kubernetes.core.v1.PersistentVolumeClaim("postgres-pvc", {
  metadata: {
    name: resourceName("postgres-pvc"),
    namespace: namespaceName_,
    labels: labels,
  },
  spec: {
    accessModes: ["ReadWriteOnce"],
    resources: {
      requests: {
        storage: dbConfig.storageSize,
      },
    },
  },
}, { provider: k8sProvider });

// PostgreSQL StatefulSet
const postgresStatefulSet = new kubernetes.apps.v1.StatefulSet("postgres", {
  metadata: {
    name: resourceName("postgres"),
    namespace: namespaceName_,
    labels: labels,
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
        containers: [{
          name: "postgres",
          image: `postgres:${dbConfig.version}`,
          ports: [{
            containerPort: 5432,
            name: "postgres",
          }],
          envFrom: [{
            secretRef: {
              name: postgresSecret.metadata.name,
            },
          }],
          volumeMounts: [{
            name: "postgres-storage",
            mountPath: "/var/lib/postgresql/data",
            subPath: "postgres",
          }],
          livenessProbe: {
            exec: {
              command: ["pg_isready", "-U", dbConfig.user],
            },
            initialDelaySeconds: 30,
            periodSeconds: 10,
          },
          readinessProbe: {
            exec: {
              command: ["pg_isready", "-U", dbConfig.user],
            },
            initialDelaySeconds: 5,
            periodSeconds: 5,
          },
        }],
        volumes: [{
          name: "postgres-storage",
          persistentVolumeClaim: {
            claimName: postgresPVC.metadata.name,
          },
        }],
      },
    },
  },
}, { provider: k8sProvider });

// PostgreSQL Service
const postgresService = new kubernetes.core.v1.Service("postgres-service", {
  metadata: {
    name: resourceName("postgres"),
    namespace: namespaceName_,
    labels: labels,
  },
  spec: {
    selector: {
      ...labels,
      component: "postgres",
    },
    ports: [{
      port: 5432,
      targetPort: 5432,
      name: "postgres",
    }],
    type: "ClusterIP",
  },
}, { provider: k8sProvider });

// Export connection details
export const postgresEndpoint = pulumi.interpolate`${postgresService.metadata.name}.${namespaceName_}.svc.cluster.local:5432`;
export const postgresConnectionString = pulumi.secret(pulumi.interpolate`postgresql://${dbConfig.user}:${dbConfig.password}@${postgresEndpoint}/${dbConfig.name}`);
export const postgresSecretName = postgresSecret.metadata.name;