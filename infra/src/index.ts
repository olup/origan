import { deployBucket } from "./components/bucket";
import { deployControl } from "./components/control";
import { deployDatabase } from "./components/database";
import { deployGateway } from "./components/gateway";
import { deployKubernetes } from "./components/kubernetes";
import { deployRegistry } from "./components/registry";
import { deployRunner } from "./components/runner";

export function deployAll() {
  // Deploy database
  const db = deployDatabase();

  // Deploy bucket and get credentials
  const bucketDeployment = deployBucket();

  // Deploy registry and get credentials
  const registryDeployment = deployRegistry();

  // Deploy Kubernetes cluster first
  const kubernetes = deployKubernetes();

  // Deploy control API with Kubernetes configuration (including nginx ingress)
  const controlResult = deployControl({
    registry: registryDeployment.namespace,
    registryApiKey: registryDeployment.registryApiKey,
    k8sProvider: kubernetes.k8sProvider,
    db,
    bucketConfig: bucketDeployment.config,
    nginxIngress: kubernetes.nginxIngress,
  });

  // Deploy runner with Kubernetes configuration
  const runnerResult = deployRunner({
    registry: registryDeployment.namespace,
    registryApiKey: registryDeployment.registryApiKey,
    k8sProvider: kubernetes.k8sProvider,
    bucketConfig: bucketDeployment.config,
  });

  // Deploy gateway last since it needs both URLs and k8s configuration
  const gatewayDeployment = deployGateway({
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
    bucketUrl: bucketDeployment.config.bucketUrl,
    bucketName: bucketDeployment.config.bucketName,
    bucketRegion: bucketDeployment.config.bucketRegion,
    bucketAccessKey: bucketDeployment.config.bucketAccessKey,
    bucketSecretKey: bucketDeployment.config.bucketSecretKey,
  };
}
