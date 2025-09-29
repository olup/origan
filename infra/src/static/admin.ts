import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import { k8sProvider } from "../providers.js";
import { 
  labels,
  namespace,
  adminUrl,
} from "../config.js";
import { adminServiceName } from "./admin-deployment.js";

// Ingress for admin panel - points to nginx static server
const adminIngress = new kubernetes.networking.v1.Ingress("admin-ingress", {
  metadata: {
    name: "admin-panel",
    namespace: namespace,
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
      secretName: "admin-panel-tls",
    }],
    rules: [{
      host: adminUrl,
      http: {
        paths: [{
          path: "/",
          pathType: "Prefix",
          backend: {
            service: {
              name: adminServiceName,
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

// Export the URL
export const adminPanelUrl = pulumi.interpolate`https://${adminUrl}`;