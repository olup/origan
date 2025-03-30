import * as random from "@pulumi/random";
import * as scaleway from "@pulumiverse/scaleway";
import { deployControl } from "./components/control";
import { gn } from "./utils";
import { deployDatabase } from "./components/database";

export default function deployAll() {
  const registry = new scaleway.registry.Namespace(gn("registry"), {
    isPublic: false,
    name: "origan-registry",
  });

  const db = deployDatabase();

  deployControl(registry, db);
}
