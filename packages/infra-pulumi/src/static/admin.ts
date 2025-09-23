import * as pulumi from "@pulumi/pulumi";
import * as command from "@pulumi/command";
import * as kubernetes from "@pulumi/kubernetes";
import { k8sProvider } from "../providers.js";
import { namespaceName_ } from "../core/namespace.js";
import { adminBucketName, externalGarageEndpoint } from "../core/storage.js";
import { StaticSiteUploader } from "../providers/static-site-uploader.js";
import { 
  resourceName, 
  labels, 
  adminUrl,
  garageAccessKey,
  garageSecretKey,
} from "../config.js";

// Build the admin panel
const adminBuild = new command.local.Command("admin-build", {
  dir: "../admin",
  create: "npm run build",
  // Trigger rebuild when source files change
  triggers: [Date.now().toString()], // In production, use file hashes
});

// Upload admin panel to S3/Garage
export const adminUpload = new StaticSiteUploader("admin-upload", {
  bucketName: adminBucketName,
  sourcePath: "../admin/dist",
  bucketEndpoint: externalGarageEndpoint,
  accessKeyId: garageAccessKey?.apply(k => k || process.env.GARAGE_ACCESS_KEY || ""),
  secretAccessKey: garageSecretKey?.apply(k => k || process.env.GARAGE_SECRET_KEY || ""),
  invalidateOnChange: true,
  deleteOrphaned: true,
}, { 
  dependsOn: [adminBuild],
});

// Ingress for admin panel
const adminIngress = new kubernetes.networking.v1.Ingress("admin-ingress", {
  metadata: {
    name: resourceName("admin"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "admin",
    },
    annotations: {
      "kubernetes.io/ingress.class": "traefik",
      "cert-manager.io/cluster-issuer": "letsencrypt-prod",
      // If serving directly from Garage, you might need these:
      "traefik.ingress.kubernetes.io/router.middlewares": `${namespaceName_}-admin-rewrite@kubernetescrd`,
    },
  },
  spec: {
    tls: [{
      hosts: [adminUrl],
      secretName: resourceName("admin-tls"),
    }],
    rules: [{
      host: adminUrl,
      http: {
        paths: [{
          path: "/",
          pathType: "Prefix",
          backend: {
            service: {
              // This should point to either:
              // 1. A Garage proxy service
              // 2. A static file server that reads from Garage
              // For now, assuming there's a garage service
              name: "garage", // You'll need to adjust this based on your setup
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

// Alternative: Create a simple nginx deployment to serve from S3
const adminStaticServer = new kubernetes.apps.v1.Deployment("admin-static-server", {
  metadata: {
    name: resourceName("admin-static"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "admin-static",
    },
  },
  spec: {
    replicas: 2,
    selector: {
      matchLabels: {
        ...labels,
        component: "admin-static",
      },
    },
    template: {
      metadata: {
        labels: {
          ...labels,
          component: "admin-static",
        },
      },
      spec: {
        containers: [{
          name: "nginx",
          image: "nginx:alpine",
          ports: [{
            containerPort: 80,
            name: "http",
          }],
          volumeMounts: [{
            name: "config",
            mountPath: "/etc/nginx/conf.d",
          }],
          resources: {
            requests: {
              memory: "64Mi",
              cpu: "10m",
            },
            limits: {
              memory: "128Mi",
              cpu: "50m",
            },
          },
        }],
        volumes: [{
          name: "config",
          configMap: {
            name: resourceName("admin-nginx-config"),
          },
        }],
      },
    },
  },
}, { provider: k8sProvider });

// Nginx config to proxy to S3/Garage
const adminNginxConfig = new kubernetes.core.v1.ConfigMap("admin-nginx-config", {
  metadata: {
    name: resourceName("admin-nginx-config"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "admin-static",
    },
  },
  data: {
    "default.conf": pulumi.interpolate`
      server {
        listen 80;
        server_name ${adminUrl};
        
        location / {
          proxy_pass ${externalGarageEndpoint}/${adminBucketName}/;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          
          # Try files, fallback to index.html for SPA routing
          try_files $uri $uri/ /index.html;
        }
      }
    `,
  },
}, { provider: k8sProvider });

// Service for the static server
const adminStaticService = new kubernetes.core.v1.Service("admin-static-service", {
  metadata: {
    name: resourceName("admin-static"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "admin-static",
    },
  },
  spec: {
    selector: {
      ...labels,
      component: "admin-static",
    },
    ports: [{
      port: 80,
      targetPort: 80,
      name: "http",
    }],
    type: "ClusterIP",
  },
}, { provider: k8sProvider });

// Update ingress to use the static server
const adminIngressWithStaticServer = new kubernetes.networking.v1.Ingress("admin-ingress-static", {
  metadata: {
    name: resourceName("admin-ingress"),
    namespace: namespaceName_,
    labels: {
      ...labels,
      component: "admin",
    },
    annotations: {
      "kubernetes.io/ingress.class": "traefik",
      "cert-manager.io/cluster-issuer": "letsencrypt-prod",
    },
  },
  spec: {
    tls: [{
      hosts: [adminUrl],
      secretName: resourceName("admin-tls"),
    }],
    rules: [{
      host: adminUrl,
      http: {
        paths: [{
          path: "/",
          pathType: "Prefix",
          backend: {
            service: {
              name: adminStaticService.metadata.name,
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
export const adminPanelUrl = pulumi.interpolate`https://${adminUrl}`;
export const adminFilesUploaded = adminUpload.filesUploaded;
export const adminBucket = adminBucketName;