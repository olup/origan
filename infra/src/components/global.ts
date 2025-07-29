import { createUser, fromSeed } from "@nats-io/nkeys";
import * as k8s from "@pulumi/kubernetes";
import type * as pulumi from "@pulumi/pulumi";
import * as scaleway from "@pulumiverse/scaleway";

import { gn } from "../utils";
import { k } from "./kubernetes";

export interface GlobalResourcesOutput {
  nats: {
    endpoint: pulumi.Output<string>;
    creds: pulumi.Output<string>;
    // account: scaleway.mnq.NatsAccount;
    // creds: scaleway.mnq.NatsCredentials;
  };
}

export function deployGlobal(): GlobalResourcesOutput {
  const natsAccount = new scaleway.mnq.NatsAccount(gn("nats"), {
    name: "origan-nats",
  });
  const natsCred = new scaleway.mnq.NatsCredentials(gn("nats-cred"), {
    accountId: natsAccount.id,
    name: "origan",
  });

  return {
    nats: {
      endpoint: natsAccount.endpoint,
      creds: natsCred.file,
    },
  };
}

export function deployGlobalToKubernetes(
  provider: k8s.Provider,
  natsPublicKey: string,
) {
  const ns = new k8s.core.v1.Namespace(
    k("nats-ns"),
    {
      metadata: {
        name: "nats",
      },
    },
    { provider },
  );

  const nats = new k8s.helm.v4.Chart(
    k("nats"),
    {
      chart: "nats",
      name: "nats",
      repositoryOpts: {
        repo: "https://nats-io.github.io/k8s/helm/charts",
      },
      namespace: ns.metadata.name,
      values: {
        config: {
          jetstream: {
            enabled: true,
            fileStore: {
              pvc: {
                size: "10Gi",
              },
            },
          },
          merge: {
            accounts: {
              origan: {
                users: [{ nkey: natsPublicKey }],
              },
            },
          },
        },
        container: {
          env: {
            GOMEMLIMIT: "6GiB",
          },
          merge: {
            resources: {
              requests: {
                cpu: "2",
                memory: "8Gi",
              },
              limits: {
                cpu: "2",
                memory: "8Gi",
              },
            },
          },
        },
        service: {
          merge: {
            spec: {
              type: "ClusterIP", // XXX: Check if we want an other type of service here
            },
          },
        },
      },
    },
    { provider },
  );
}
