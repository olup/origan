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
  landingUrl,
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

// Calculate hash for landing directory
const landingOutPath = path.join(monorepoRoot, "packages/landing/out");
const landingHash = calculateDirectoryHash(landingOutPath);

// Build and push Docker image for landing
const landingImage = new docker.Image("landing-nginx", {
  imageName: pulumi.interpolate`registry.platform.origan.dev/landing-nginx:${landingHash}`,
  build: {
    context: monorepoRoot,
    dockerfile: path.join(monorepoRoot, "docker/nginx-landing.Dockerfile"),
    platform: "linux/amd64",
  },
  skipPush: false, // Push to our registry
});

// Create landing nginx deployment
const landingDeployment = new kubernetes.apps.v1.Deployment("landing-nginx-server", {
  metadata: {
    name: "landing-nginx-server",
    namespace: namespace,
    labels: {
      ...labels,
      component: "landing-server",
    },
    annotations: {
      "pulumi.com/content-hash": landingHash,
    },
  },
  spec: {
    replicas: 1,
    selector: {
      matchLabels: {
        app: "landing-nginx-server",
      },
    },
    template: {
      metadata: {
        labels: {
          ...labels,
          app: "landing-nginx-server",
        },
        annotations: {
          "pulumi.com/content-hash": landingHash,
        },
      },
      spec: {
        containers: [{
          name: "nginx",
          image: landingImage.imageName,
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
  dependsOn: [landingImage],
});

// Create service for landing nginx
export const landingService = new kubernetes.core.v1.Service("landing-nginx-service", {
  metadata: {
    name: "landing-nginx-server",
    namespace: namespace,
    labels: {
      ...labels,
      component: "landing-server",
    },
  },
  spec: {
    selector: {
      app: "landing-nginx-server",
    },
    ports: [{
      name: "http",
      port: 80,
      targetPort: 80,
    }],
    type: "ClusterIP",
  },
}, { provider: k8sProvider });

export const landingServiceName = landingService.metadata.name;
export const landingContentHash = landingHash;