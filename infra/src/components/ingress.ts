import * as k8s from "@pulumi/kubernetes";
import { gn } from "../utils";

interface ServiceRoute {
  host: string;
  serviceName: string;
  port: number;
}

export function deploySharedIngress({
  k8sProvider,
  nginxIngress,
  services,
}: {
  k8sProvider: k8s.Provider;
  nginxIngress: k8s.helm.v3.Release;
  services: ServiceRoute[];
}) {
  const ingress = new k8s.networking.v1.Ingress(
    gn("k8s-shared-ingress"),
    {
      metadata: {
        name: "main-ingress",
        annotations: {
          "cert-manager.io/cluster-issuer": "letsencrypt-prod",
          "nginx.ingress.kubernetes.io/ssl-redirect": "false",
          "nginx.ingress.kubernetes.io/force-ssl-redirect": "false",
          "nginx.ingress.kubernetes.io/proxy-body-size": "100m",
        },
      },
      spec: {
        ingressClassName: "nginx",
        tls: [
          {
            hosts: services.map((s) => s.host),
            secretName: "wildcard-origan-dev-tls",
          },
        ],
        rules: services.map((service) => ({
          host: service.host,
          http: {
            paths: [
              {
                path: "/",
                pathType: "Prefix",
                backend: {
                  service: {
                    name: service.serviceName,
                    port: { number: service.port },
                  },
                },
              },
            ],
          },
        })),
      },
    },
    { provider: k8sProvider, dependsOn: [nginxIngress] },
  );

  return {
    ingress,
  };
}
