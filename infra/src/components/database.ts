import * as random from "@pulumi/random";
import type * as pulumi from "@pulumi/pulumi";
import * as scaleway from "@pulumiverse/scaleway";
import { gn } from "../utils";

export interface DatabaseOutputs {
  host: pulumi.Output<string>;
  port: pulumi.Output<number>;
  user: pulumi.Output<string>;
  password: pulumi.Output<string>;
  database: pulumi.Output<string>;
}

export function deployDatabase(): DatabaseOutputs {
  const password = new random.RandomPassword(gn("shared-db-password-value"), {
    length: 32,
    special: true,
  });
  const sharedDbPassword = new scaleway.secrets.Secret(
    gn("shared-db-password"),
    { name: "origan-shared-db-password" },
  );
  new scaleway.secrets.Version(gn("shared-db-password-version"), {
    secretId: sharedDbPassword.id,
    data: password.result,
  });
  const sharedDb = new scaleway.databases.Instance(gn("shared-db"), {
    name: "origan-shared-db",
    nodeType: "db-dev-s",
    engine: "PostgreSQL-16",
    isHaCluster: false,
    disableBackup: false,
    userName: "origan-root",
    password: password.result,
  });
  const lb = sharedDb.loadBalancers[0];
  const sharedMainDatabase = new scaleway.databases.Database(
    gn("shared-db-database"),
    {
      instanceId: sharedDb.id,
      name: "origan",
    },
  );

  return {
    host: lb.hostname,
    port: lb.port,
    user: sharedDb.userName,
    password: password.result,
    database: sharedMainDatabase.name,
  };
}
