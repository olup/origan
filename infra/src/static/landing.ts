import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import { k8sProvider } from "../providers.js";
import { 
  labels,
  namespace,
  landingUrl,
} from "../config.js";
import { landingServiceName } from "./landing-deployment.js";

// Ingress for landing page - points to nginx static server
const landingIngress = new kubernetes.networking.v1.Ingress("landing-ingress", {
  metadata: {
    name: "landing-page",
    namespace: namespace,
    labels: {
      ...labels,
      component: "landing",
    },
    annotations: {
      "kubernetes.io/ingress.class": "traefik",
      "cert-manager.io/cluster-issuer": "letsencrypt-prod",
    },
  },
  spec: {
    tls: [{
      hosts: [landingUrl],
      secretName: "landing-page-tls",
    }],
    rules: [{
      host: landingUrl,
      http: {
        paths: [{
          path: "/",
          pathType: "Prefix",
          backend: {
            service: {
              name: landingServiceName,
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
export const landingPageUrl = pulumi.interpolate`https://${landingUrl}`;