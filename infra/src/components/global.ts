import * as scaleway from "@pulumiverse/scaleway";

import { gn } from "../utils";

export interface Global {
  nats: {
    account: scaleway.mnq.NatsAccount;
    creds: scaleway.mnq.NatsCredentials;
  };
}

export function deployGlobal(): Global {
  const natsAccount = new scaleway.mnq.NatsAccount(gn("nats"), {
    name: "origan-nats",
  });
  const natsCred = new scaleway.mnq.NatsCredentials(gn("nats-cred"), {
    accountId: natsAccount.id,
    name: "origan",
  });

  return {
    nats: {
      account: natsAccount,
      creds: natsCred,
    },
  };
}
