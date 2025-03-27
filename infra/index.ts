import * as scaleway from "@pulumiverse/scaleway";
import { deployControl } from "./components/control";
import { gn } from "./utils";

const registry = new scaleway.registry.Namespace(gn("registry"), {
  isPublic: false,
  name: "origan-registry",
});

deployControl(registry);
