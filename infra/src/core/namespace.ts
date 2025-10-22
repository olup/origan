import * as kubernetes from "@pulumi/kubernetes";
import { labels, namespace as namespaceName } from "../config.js";
import { k8sProvider } from "../providers.js";

export const namespace = new kubernetes.core.v1.Namespace(
  "origan-namespace",
  {
    metadata: {
      name: namespaceName,
      labels: labels,
    },
  },
  { provider: k8sProvider },
);

export const namespaceName_ = namespace.metadata.name;
