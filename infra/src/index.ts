import { deployBucket } from "./components/bucket";
import { deployControl } from "./components/control";
import { deployDatabase } from "./components/database";
import { deployGateway } from "./components/gateway";
import { deployRegistry } from "./components/registry";
import { deployRunner } from "./components/runner";

export async function deployAll() {
  // Deploy database
  const db = deployDatabase();

  // Deploy bucket and get credentials
  const bucketDeployment = deployBucket();

  // Deploy registry and get credentials
  const registryDeployment = deployRegistry();

  // Deploy runner first since gateway needs its URL
  const runnerResult = deployRunner(
    registryDeployment.namespace,
    registryDeployment.registryApiKey,
    bucketDeployment.config,
  );

  // Deploy control and get its API URL for the gateway
  const controlResult = deployControl(
    registryDeployment.namespace,
    registryDeployment.registryApiKey,
    db,
    bucketDeployment.config,
  );

  // Deploy gateway last since it needs both URLs
  deployGateway(
    registryDeployment.namespace,
    registryDeployment.registryApiKey,
    controlResult.apiUrl,
    runnerResult.runnerUrl,
    bucketDeployment.config,
  );
}
