// Registry removed from IaC - using existing deployment

// Registry removed from IaC - using existing deployment
// All Registry resources (StatefulSet, Service, Ingress, ConfigMap, CronJob) are removed
// Use existing Registry deployment at registry.platform.origan.dev

// Export values for existing registry deployment
export const registryServiceName = "registry"; // Existing service name in platform namespace
export const registryEndpointInternal =
  "registry.platform.svc.cluster.local:5000";
export const registryEndpointExternal = "registry.platform.origan.dev";

// No registry deployment resources needed - using existing platform registry
