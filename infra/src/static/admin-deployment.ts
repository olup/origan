import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import * as docker from "@pulumi/docker";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { k8sProvider } from "../providers.js";
import { 
  labels, 
  namespace,
  adminUrl,
} from "../config.js";

// Get project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const infraRoot = path.resolve(__dirname, "../..");
const monorepoRoot = path.resolve(infraRoot, "..");

// Function to calculate directory hash
function calculateDirectoryHash(dirPath: string): string {
  const hash = crypto.createHash('sha256');
  
  function processDirectory(dir: string) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        // Skip node_modules and other build artifacts
        if (item.name !== 'node_modules' && item.name !== '.git') {
          processDirectory(fullPath);
        }
      } else {
        const content = fs.readFileSync(fullPath);
        hash.update(item.name);
        hash.update(content);
      }
    }
  }
  
  if (fs.existsSync(dirPath)) {
    processDirectory(dirPath);
  }
  return hash.digest('hex').substring(0, 8);
}

// Calculate hash for admin directory
const adminDistPath = path.join(monorepoRoot, "packages/admin/dist");
const adminHash = calculateDirectoryHash(adminDistPath);

// Build and push Docker image for admin
const adminImage = new docker.Image("admin-nginx", {
  imageName: pulumi.interpolate`registry.platform.origan.dev/admin-nginx:${adminHash}`,
  build: {
    context: monorepoRoot,
    dockerfile: path.join(monorepoRoot, "docker/nginx-admin.Dockerfile"),
    platform: "linux/amd64",
  },
  skipPush: false, // Push to our registry
});

// Create admin nginx deployment
const adminDeployment = new kubernetes.apps.v1.Deployment("admin-nginx-server", {
  metadata: {
    name: "admin-nginx-server",
    namespace: namespace,
    labels: {
      ...labels,
      component: "admin-server",
    },
    annotations: {
      "pulumi.com/content-hash": adminHash,
    },
  },
  spec: {
    replicas: 1,
    selector: {
      matchLabels: {
        app: "admin-nginx-server",
      },
    },
    template: {
      metadata: {
        labels: {
          ...labels,
          app: "admin-nginx-server",
        },
        annotations: {
          "pulumi.com/content-hash": adminHash,
        },
      },
      spec: {
        containers: [{
          name: "nginx",
          image: adminImage.imageName,
          imagePullPolicy: "Always",
          ports: [{
            name: "http",
            containerPort: 80,
          }],
          resources: {
            requests: {
              cpu: "50m",
              memory: "64Mi",
            },
            limits: {
              cpu: "200m",
              memory: "256Mi",
            },
          },
          livenessProbe: {
            httpGet: {
              path: "/",
              port: 80,
            },
            initialDelaySeconds: 10,
            periodSeconds: 30,
          },
          readinessProbe: {
            httpGet: {
              path: "/",
              port: 80,
            },
            initialDelaySeconds: 5,
            periodSeconds: 10,
          },
        }],
      },
    },
  },
}, { 
  provider: k8sProvider,
  dependsOn: [adminImage],
});

// Create service for admin nginx
export const adminService = new kubernetes.core.v1.Service("admin-nginx-service", {
  metadata: {
    name: "admin-nginx-server",
    namespace: namespace,
    labels: {
      ...labels,
      component: "admin-server",
    },
  },
  spec: {
    selector: {
      app: "admin-nginx-server",
    },
    ports: [{
      name: "http",
      port: 80,
      targetPort: 80,
    }],
    type: "ClusterIP",
  },
}, { provider: k8sProvider });

export const adminServiceName = adminService.metadata.name;
export const adminContentHash = adminHash;