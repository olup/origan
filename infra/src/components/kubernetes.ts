import * as pulumi from "@pulumi/pulumi";
import * as scaleway from "@pulumiverse/scaleway";
import * as k8s from "@pulumi/kubernetes";
import { gn } from "../utils";

const scalewayConfig = new pulumi.Config("scaleway");

interface DeployKubernetesParams {
  registry: scaleway.registry.Namespace;
  controlApiUrl: pulumi.Output<string>;
  runnerUrl: pulumi.Output<string>;
  bucketConfig: {
    bucketUrl: pulumi.Output<string>;
    bucketName: pulumi.Output<string>;
    bucketAccessKey: pulumi.Output<string>;
    bucketRegion: pulumi.Output<string>;
    bucketSecretKey: pulumi.Output<string>;
  };
}

export interface KubernetesOutputs {
  kubeconfig: pulumi.Output<string>;
  clusterId: pulumi.Output<string>;
  status: pulumi.Output<string>;
  k8sProvider: k8s.Provider;
  nginxIngress: k8s.helm.v3.Release;
  certManager: k8s.helm.v3.Release;
  scalewayWebhook: k8s.helm.v3.Release;
  wildcardCert: k8s.apiextensions.CustomResource;
}

const k = (name: string) => gn(`k8s-${name}`);
const ks = (name: string) => `g-k8s-${name}`;

export function deployKubernetes(
  params: DeployKubernetesParams,
): KubernetesOutputs {
  // Create a private network for the cluster
  const privateNetwork = new scaleway.network.PrivateNetwork(
    k("cluster-network"),
    {
      region: "fr-par",
    },
  );

  // Create a Kubernetes cluster
  const cluster = new scaleway.kubernetes.Cluster(k("test-cluster"), {
    version: "1.28.15",
    privateNetworkId: privateNetwork.id,
    cni: "cilium",
    deleteAdditionalResources: true,
    type: "kapsule",
    region: "fr-par",
    tags: ["test", "minimal"],
  });

  // Create a small node pool
  const nodePool = new scaleway.kubernetes.Pool(k("test-pool"), {
    clusterId: cluster.id,
    nodeType: "DEV1-M", // Small development instance
    size: 1, // Minimum size
    minSize: 1,
    maxSize: 2, // Allow small autoscaling
    autohealing: true,
    autoscaling: true,
    containerRuntime: "containerd",
    region: "fr-par",
  });

  // Create a Kubernetes provider using the cluster's kubeconfig
  const k8sProvider = new k8s.Provider(k("provider"), {
    kubeconfig: cluster.kubeconfigs[0].configFile,
  });

  // Install nginx-ingress controller with minimal configuration
  const nginxIngress = new k8s.helm.v3.Release(
    ks("nginx-ingress"),
    {
      chart: "ingress-nginx",
      repositoryOpts: {
        repo: "https://kubernetes.github.io/ingress-nginx",
      },
      namespace: "ingress-nginx",
      createNamespace: true,
      values: {
        controller: {
          service: {
            annotations: {
              // Scaleway-specific annotations
              "service.beta.kubernetes.io/scw-loadbalancer-use-hostname":
                "true",
            },
          },
        },
      },
    },
    { provider: k8sProvider },
  );

  // Install cert-manager
  const certManager = new k8s.helm.v3.Release(
    k("cert-manager"),
    {
      chart: "cert-manager",
      repositoryOpts: {
        repo: "https://charts.jetstack.io",
      },
      namespace: "cert-manager",
      createNamespace: true,
      values: {
        installCRDs: true,
      },
    },
    { provider: k8sProvider },
  );

  // Install Scaleway webhook for cert-manager
  const scalewayWebhook = new k8s.helm.v3.Release(
    k("scaleway-certmanager-webhook"),
    {
      chart: "scaleway-certmanager-webhook",
      repositoryOpts: {
        repo: "https://scaleway.github.io/helm-charts",
      },
      namespace: "cert-manager",
      values: {
        secret: {
          accessKey: scalewayConfig.require("access_key"),
          secretKey: scalewayConfig.requireSecret("secret_key"),
        },
      },
    },
    { provider: k8sProvider, dependsOn: [certManager] },
  );

  const clusterIssuer = new k8s.apiextensions.CustomResource(
    k("letsencrypt-prod"),
    {
      apiVersion: "cert-manager.io/v1",
      kind: "ClusterIssuer",
      metadata: {
        name: "letsencrypt-prod",
      },
      spec: {
        acme: {
          email: "loup.topalian@gmail.com",
          server: "https://acme-v02.api.letsencrypt.org/directory",
          privateKeySecretRef: {
            name: "letsencrypt-prod",
          },
          solvers: [
            {
              dns01: {
                webhook: {
                  groupName: "dns.scaleway.com",
                  solverName: "scaleway",
                  config: {
                    projectId: "", // TODO: Add your Scaleway project ID
                  },
                },
              },
            },
          ],
        },
      },
    },
    { provider: k8sProvider, dependsOn: [certManager, scalewayWebhook] },
  );

  // Create wildcard certificate
  const wildcardCert = new k8s.apiextensions.CustomResource(
    k("wildcard-deploy-origan-dev"),
    {
      apiVersion: "cert-manager.io/v1",
      kind: "Certificate",
      metadata: {
        name: "wildcard-deploy-origan-dev",
        namespace: "default",
      },
      spec: {
        secretName: "wildcard-deploy-origan-dev-tls",
        commonName: "*.deploy.origan.dev",
        dnsNames: ["*.deploy.origan.dev"],
        issuerRef: {
          name: "letsencrypt-prod",
          kind: "ClusterIssuer",
        },
      },
    },
    { provider: k8sProvider, dependsOn: [clusterIssuer] },
  );

  // Return the cluster details and configuration
  return {
    kubeconfig: cluster.kubeconfigs[0].configFile,
    clusterId: cluster.id,
    status: cluster.status,
    k8sProvider,
    nginxIngress,
    certManager,
    scalewayWebhook,
    wildcardCert,
  };
}
