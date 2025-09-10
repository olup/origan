import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { deployAdminPanel } from "./components/admin-panel";
import { deployBucket } from "./components/bucket";
import { deployBuilderImage } from "./components/builder";
import { deployControl } from "./components/control";
import {
  deployDatabase,
  deployDatabaseToKubernetes,
} from "./components/database";
import { deployGateway } from "./components/gateway";
import { deployGlobal, deployGlobalToKubernetes } from "./components/global";
import { deploySharedIngress } from "./components/ingress";
import { deployKubernetes } from "./components/kubernetes";
import { deployRegistry } from "./components/registry";
import { deployRunner } from "./components/runner";
import { config } from "./config";

export function deployToScaleway() {
  const globals = deployGlobal();

  // Deploy database
  const db = deployDatabase();

  // Deploy bucket and get credentials
  const bucketDeployment = deployBucket();

  // Deploy registry and get credentials
  const registryDeployment = deployRegistry();

  // Deploy builder image
  const builderImage = deployBuilderImage(registryDeployment);

  // Deploy Kubernetes cluster first
  const kubernetes = deployKubernetes(config.axiom);

  // Deploy admin panel frontend
  const adminPanelResult = deployAdminPanel({
    registry: registryDeployment.namespace,
    registryApiKey: registryDeployment.registryApiKey,
    k8sProvider: kubernetes.k8sProvider,
  });

  // Deploy control API
  const controlResult = deployControl({
    registry: registryDeployment.namespace,
    registryApiKey: registryDeployment.registryApiKey,
    k8sProvider: kubernetes.k8sProvider,
    db,
    bucketConfig: bucketDeployment.config,
    buildRunnerImage: buildRunnerImage.imageUri,
    nats: globals.nats,
    buildRunnerServiceAccount: kubernetes.buildRunnerRoleBinding,
  });

  // Deploy shared ingress for both control API and admin panel
  deploySharedIngress({
    k8sProvider: kubernetes.k8sProvider,
    nginxIngress: kubernetes.nginxIngress,
    services: [
      {
        host: "api.origan.dev",
        serviceName: "control-api",
        port: 80,
      },
      {
        host: "app.origan.dev",
        serviceName: "admin-panel",
        port: 80,
      },
    ],
  });

  // Deploy runner with Kubernetes configuration
  const runnerResult = deployRunner({
    registry: registryDeployment.namespace,
    registryApiKey: registryDeployment.registryApiKey,
    k8sProvider: kubernetes.k8sProvider,
    bucketConfig: bucketDeployment.config,
    nats: globals.nats,
  });

  // Deploy gateway last since it needs both URLs and k8s configuration
  deployGateway({
    registry: registryDeployment.namespace,
    registryApiKey: registryDeployment.registryApiKey,
    k8sProvider: kubernetes.k8sProvider,
    controlApiUrl: controlResult.apiUrl,
    runnerUrl: runnerResult.runnerUrl,
    bucketConfig: bucketDeployment.config,
  });

  // Export outputs
  return {
    apiUrl: controlResult.apiUrl,
    adminPanelUrl: adminPanelResult.adminPanelUrl,
    bucketUrl: bucketDeployment.config.bucketUrl,
    bucketName: bucketDeployment.config.bucketName,
    bucketRegion: bucketDeployment.config.bucketRegion,
    bucketAccessKey: bucketDeployment.config.bucketAccessKey,
    bucketSecretKey: bucketDeployment.config.bucketSecretKey,
    nats: globals.nats,
    database: db,
  };
}

export function deployToK3s() {
  const k8sProvider = new k8s.Provider("k3s-provider", {
    context: "origan-k3s",
  });
  if (!config.nats) {
    throw new Error("Missing nats config");
  }
  deployGlobalToKubernetes(k8sProvider, config.nats.userPublicKey);
  const database = deployDatabaseToKubernetes(k8sProvider);

  // FIXME: don't output the same stuff as for the normal stack
  return {
    apiUrl: pulumi.Output.create("todo"),
    adminPanelUrl: pulumi.Output.create("todo"),
    bucketUrl: pulumi.Output.create("todo"),
    bucketName: pulumi.Output.create("todo"),
    bucketRegion: pulumi.Output.create("todo"),
    bucketAccessKey: pulumi.Output.create("todo"),
    bucketSecretKey: pulumi.Output.create("todo"),
    nats: {
      endpoint: pulumi.Output.create("none"),
      creds: pulumi.Output.create("see-pulumi-resource"),
    },
    database: {
      connectionString: database,
    },
  };
}
