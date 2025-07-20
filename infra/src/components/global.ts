import { createUser } from "@nats-io/nkeys";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
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

const NatsUserProvider: pulumi.dynamic.ResourceProvider = {
  async create(_inputs) {
    const user = createUser();
    const privateKey = new TextDecoder().decode(user.getPrivateKey());
    const seed = new TextDecoder().decode(user.getSeed());
    return {
      id: crypto.randomUUID(),
      outs: {
        publicKey: user.getPublicKey(),
        privateKey: privateKey,
        seed: seed,
      },
    };
  },
};

class NatsUser extends pulumi.dynamic.Resource {
  public readonly publicKey!: pulumi.Output<string>;
  public readonly privateKey!: pulumi.Output<string>;
  public readonly seed!: pulumi.Output<string>;

  constructor(name: string, opts?: pulumi.CustomResourceOptions) {
    super(
      NatsUserProvider,
      name,
      { publicKey: undefined, privateKey: undefined, seed: undefined },
      opts,
    );
  }
}

export function deployGlobalToKubernetes(
  provider: k8s.Provider,
): GlobalResourcesOutput {
  const ns = new k8s.core.v1.Namespace(
    k("nats-ns"),
    {
      metadata: {
        name: "nats",
      },
    },
    { provider },
  );

  const user = new NatsUser(k("nats-user"));

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
          accounts: {
            origan: {
              users: [{ user: "origan", nkey: user.publicKey }],
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

  return {
    nats: {
      endpoint: pulumi.Output.create("tbd"),
      creds: pulumi.interpolate`${user.seed}\n${user.publicKey}`,
    },
  };
}
