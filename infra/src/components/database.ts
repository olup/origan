import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as scaleway from "@pulumiverse/scaleway";
import { gn } from "../utils";
import { k } from "./kubernetes";

export interface DatabaseOutputs {
  host: pulumi.Output<string>;
  port: pulumi.Output<number>;
  user: pulumi.Output<string>;
  password: pulumi.Output<string>;
  database: pulumi.Output<string>;
  connectionString: pulumi.Output<string>;
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
  new scaleway.databases.Privilege(gn("shared-db-origan-privilege"), {
    instanceId: sharedDb.id,
    databaseName: sharedMainDatabase.name,
    userName: "origan-root",
    permission: "all",
  });

  const connectionString = pulumi
    .all([
      lb.ip,
      lb.port,
      sharedDb.userName,
      password.result,
      sharedMainDatabase.name,
    ])
    .apply(
      ([host, port, user, password, database]) =>
        `postgresql://${user}:${password}@${host}:${port}/${database}`,
    );

  return {
    host: lb.ip,
    port: lb.port,
    user: sharedDb.userName,
    password: password.result,
    database: sharedMainDatabase.name,
    connectionString,
  };
}

export function deployDatabaseToKubernetes(provider: k8s.Provider) {
  const ns = new k8s.core.v1.Namespace(
    k("postgres-ns"),
    {
      metadata: {
        name: "postgres",
      },
    },
    { provider },
  );

  const postgresOp = new k8s.helm.v4.Chart(
    k("postgres-operator"),
    {
      chart: "postgres-operator",
      name: "postgres",
      repositoryOpts: {
        repo: "https://raw.githubusercontent.com/zalando/postgres-operator/master/charts/postgres-operator",
      },
      namespace: ns.metadata.name,
    },
    { provider },
  );
  const postgresOpUi = new k8s.helm.v4.Chart(
    k("postgres-operator-ui"),
    {
      chart: "postgres-operator-ui",
      name: "postgres-ui",
      repositoryOpts: {
        repo: "https://raw.githubusercontent.com/zalando/postgres-operator/master/charts/postgres-operator-ui",
      },
      namespace: ns.metadata.name,
    },
    { provider },
  );

  const database = new k8s.apiextensions.CustomResource(
    k("postgres-db"),
    {
      apiVersion: "acid.zalan.do/v1",
      kind: "postgresql",
      metadata: {
        name: "postgres",
        namespace: ns.metadata.name,
      },
      spec: {
        teamId: "origan",
        volume: {
          size: "50Gi",
        },
        numberOfInstances: 1,
        enableConnectionPooler: true,
        users: {
          postgres: ["superuser", "createdb"],
          origan: [],
        },
        databases: {
          origan: "origan",
        },
        postgresql: {
          version: "17",
        },
      },
    },
    { dependsOn: postgresOp },
  );

  const userPassword = k8s.core.v1.Secret.get(
    "postgres-origan-password",
    pulumi.interpolate`${ns.metadata.name}/origan.${database.metadata.name}.credentials.postgresql.acid.zalan.do`,
  ).data.apply((v) => Buffer.from(v.password, "base64").toString("utf8"));

  return pulumi.interpolate`postgresql://origan:${userPassword}@localhost:5432/origan`;
}
