import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as scaleway from "@pulumiverse/scaleway";
import { gn } from "../utils";

const scalewayConfig = new pulumi.Config("scaleway");

const k = (name: string) => gn(`k8s-${name}`);
const ks = (name: string) => `g-k8s-${name}`;

export function deployKubernetes() {
  // Create a private network for the cluster
  const privateNetwork = new scaleway.network.PrivateNetwork(
    k("cluster-network"),
    {
      region: "fr-par",
    },
  );

  // Create a Kubernetes cluster
  const cluster = new scaleway.kubernetes.Cluster(k("test-cluster"), {
    version: "1.31.7",
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

  // Add ClusterRole for Scaleway ACME resources
  const scalewayAcmeRole = new k8s.rbac.v1.ClusterRole(
    k("scaleway-acme-role"),
    {
      metadata: {
        name: "scaleway-acme-solver",
      },
      rules: [
        {
          apiGroups: ["acme.scaleway.com"],
          resources: ["scaleway"],
          verbs: ["create", "get", "list", "watch", "update", "delete"],
        },
      ],
    },
    { provider: k8sProvider },
  );

  // Add ClusterRoleBinding to bind the role to cert-manager's ServiceAccount
  const scalewayAcmeRoleBinding = new k8s.rbac.v1.ClusterRoleBinding(
    k("scaleway-acme-binding"),
    {
      metadata: {
        name: "scaleway-acme-solver",
      },
      roleRef: {
        apiGroup: "rbac.authorization.k8s.io",
        kind: "ClusterRole",
        name: "scaleway-acme-solver",
      },
      subjects: [
        {
          kind: "ServiceAccount",
          name: "global-k8s-cert-manager-prod-0b046ffd",
          namespace: "cert-manager",
        },
      ],
    },
    { provider: k8sProvider, dependsOn: [scalewayAcmeRole] },
  );

  const _project = scaleway.account.getProject({
    name: "origan",
  });

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
                  groupName: "acme.scaleway.com",
                  solverName: "scaleway",
                  config: {
                    projectId: _project.then((_project) => _project.id),
                  },
                },
              },
            },
          ],
        },
      },
    },
    {
      provider: k8sProvider,
      dependsOn: [
        certManager,
        scalewayWebhook,
        scalewayAcmeRole,
        scalewayAcmeRoleBinding,
      ],
    },
  );

  // Create wildcard certificate for origan.app
  const wildcardCertApp = new k8s.apiextensions.CustomResource(
    k("wildcard-origan-app"),
    {
      apiVersion: "cert-manager.io/v1",
      kind: "Certificate",
      metadata: {
        name: "wildcard-origan-app",
        namespace: "default",
      },
      spec: {
        secretName: "wildcard-origan-app-tls",
        commonName: "*.origan.app",
        dnsNames: ["*.origan.app"],
        issuerRef: {
          name: "letsencrypt-prod",
          kind: "ClusterIssuer",
        },
      },
    },
    { provider: k8sProvider, dependsOn: [clusterIssuer] },
  );

  // Create wildcard certificate for origan.dev (for API and admin panel)
  const wildcardCertDev = new k8s.apiextensions.CustomResource(
    k("wildcard-origan-dev"),
    {
      apiVersion: "cert-manager.io/v1",
      kind: "Certificate",
      metadata: {
        name: "wildcard-origan-dev",
        namespace: "default",
      },
      spec: {
        secretName: "wildcard-origan-dev-tls",
        commonName: "*.origan.dev",
        dnsNames: ["*.origan.dev"],
        issuerRef: {
          name: "letsencrypt-prod",
          kind: "ClusterIssuer",
        },
      },
    },
    { provider: k8sProvider, dependsOn: [clusterIssuer] },
  );

  const buildRunnerServiceAccount = new k8s.core.v1.ServiceAccount(
    k("build-runner-sa"),
    {
      metadata: {
        name: "build-runner-sa",
        namespace: "default",
      },
    },
    { provider: k8sProvider },
  );

  const buildRunnerRole = new k8s.rbac.v1.Role(
    k("job-creator-role"),
    {
      metadata: {
        namespace: "default",
        name: "job-creator",
      },
      rules: [
        {
          apiGroups: ["batch"],
          resources: ["jobs"],
          verbs: ["create", "get", "list", "watch", "delete"],
        },
        {
          apiGroups: [""],
          resources: ["pods"],
          verbs: ["get", "list", "watch"],
        },
      ],
    },
    { provider: k8sProvider },
  );

  const buildRunnerRoleBinding = new k8s.rbac.v1.RoleBinding(
    k("build-runner-binding"),
    {
      metadata: {
        name: "build-runner-binding",
        namespace: "default",
      },
      subjects: [
        {
          kind: "ServiceAccount",
          name: "build-runner-sa",
          namespace: "default",
        },
      ],
      roleRef: {
        kind: "Role",
        name: "job-creator",
        apiGroup: "rbac.authorization.k8s.io",
      },
    },
    { provider: k8sProvider, dependsOn: [buildRunnerRole] },
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
    wildcardCertApp,
    wildcardCertDev,
    buildRunnerServiceAccount,
    buildRunnerRoleBinding,
    nodePool,
  };
}
