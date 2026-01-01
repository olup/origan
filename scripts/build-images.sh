#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REGISTRY_ENDPOINT="${REGISTRY_ENDPOINT:-registry.platform.origan.dev}"
IMAGE_TAG="${IMAGE_TAG:-dev}"
GITHUB_ACTIONS="${GITHUB_ACTIONS:-}"
ORIGAN_DISABLE_CACHE="${ORIGAN_DISABLE_CACHE:-}"
ORIGAN_LOCAL_ARTIFACTS="${ORIGAN_LOCAL_ARTIFACTS:-}"
ORIGAN_TARGETS="${ORIGAN_TARGETS:-}"
ORIGAN_SEQUENTIAL="${ORIGAN_SEQUENTIAL:-}"
ORIGAN_SINGLE_IMAGE="${ORIGAN_SINGLE_IMAGE:-}"
ORIGAN_CLEAN_IMAGES="${ORIGAN_CLEAN_IMAGES:-}"
ORIGAN_CLEAN_CACHE="${ORIGAN_CLEAN_CACHE:-}"

if [[ "${ORIGAN_LOCAL_ARTIFACTS}" == "1" && ! -d ".docker-prod" ]]; then
  echo "Missing .docker-prod. Run scripts/build-artifacts.sh first." >&2
  exit 1
fi

GIT_SUFFIX="$(node -e 'const {execSync}=require("node:child_process");const crypto=require("node:crypto");const commit=execSync("git rev-parse HEAD",{cwd:process.cwd(),stdio:["ignore","pipe","ignore"]}).toString().trim();const status=execSync("git status --porcelain=v2 --untracked-files=all",{cwd:process.cwd(),stdio:["ignore","pipe","ignore"]}).toString();const hash=crypto.createHash("sha256").update(`${commit}\n${status}`).digest("hex");process.stdout.write(hash.slice(0,12));')"

if [[ "${ORIGAN_DISABLE_CACHE}" == "1" ]]; then
  CACHE_FROM='[]'
  CACHE_TO='[]'
elif [[ "${GITHUB_ACTIONS}" == "true" ]]; then
  CACHE_FROM='["type=gha"]'
  CACHE_TO='["type=gha,mode=max"]'
else
  CACHE_REF="${REGISTRY_ENDPOINT}/origan/buildcache:latest"
  CACHE_FROM='["type=registry,ref='"${CACHE_REF}"'"]'
  CACHE_TO='["type=registry,ref='"${CACHE_REF}"',mode=max"]'
fi

export REGISTRY_ENDPOINT IMAGE_TAG GIT_SUFFIX CACHE_FROM CACHE_TO

node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const registry = process.env.REGISTRY_ENDPOINT;
const imageTag = process.env.IMAGE_TAG;
const gitSuffix = process.env.GIT_SUFFIX;
const cacheFrom = JSON.parse(process.env.CACHE_FROM);
const cacheTo = JSON.parse(process.env.CACHE_TO);
const turboToken = process.env.TURBO_TOKEN;
const turboTeam = process.env.TURBO_TEAM;
const localArtifacts = process.env.ORIGAN_LOCAL_ARTIFACTS === "1";
const singleImage = process.env.ORIGAN_SINGLE_IMAGE === "1";
const context = localArtifacts ? ".docker-prod" : ".";
const dockerfileFor = (name) => {
  if (localArtifacts) {
    if (name === "node-services") {
      return "../docker/prod-node-services.Dockerfile";
    }
    return "../docker/prod-runtime.Dockerfile";
  }
  return "docker/prod-optimized.Dockerfile";
};

const tagsFor = (name) => [
  `${registry}/origan/${name}:${imageTag}`,
  `${registry}/origan/${name}:${gitSuffix}`,
  `${registry}/origan/${name}:latest`,
];

const targets = singleImage
  ? ["node-services", "runner"]
  : ["control-api", "gateway", "builder", "runner"];
const target = {};

for (const name of targets) {
  target[name] = {
    dockerfile: dockerfileFor(name),
    context,
    target: name,
    tags: tagsFor(name),
    platforms: ["linux/amd64"],
    "cache-from": cacheFrom,
    "cache-to": cacheTo,
  };

  if (!localArtifacts) {
    const args = {};
    if (turboToken) args.TURBO_TOKEN = turboToken;
    if (turboTeam) args.TURBO_TEAM = turboTeam;
    if (Object.keys(args).length > 0) target[name].args = args;
  }
}

const bakeConfig = {
  group: { default: { targets } },
  target,
};

fs.writeFileSync(
  path.join(process.cwd(), "docker-bake.generated.json"),
  JSON.stringify(bakeConfig, null, 2),
);
NODE

if [[ -n "${ORIGAN_TARGETS}" ]]; then
  IFS=',' read -r -a TARGETS <<< "${ORIGAN_TARGETS// /}"
else
  if [[ "${ORIGAN_SINGLE_IMAGE}" == "1" ]]; then
    TARGETS=(node-services runner)
  else
    TARGETS=(control-api gateway builder runner)
  fi
fi

if [[ "${ORIGAN_SEQUENTIAL}" == "1" ]]; then
  for target in "${TARGETS[@]}"; do
    docker buildx bake --allow=fs.read=.. -f docker-bake.generated.json --push --provenance=false "${target}"
  done
else
  docker buildx bake --allow=fs.read=.. -f docker-bake.generated.json --push --provenance=false "${TARGETS[@]}"
fi

if [[ "${ORIGAN_CLEAN_IMAGES}" == "1" ]]; then
  node <<'NODE' | xargs -r docker image rm -f
const fs = require("node:fs");
const config = JSON.parse(fs.readFileSync("docker-bake.generated.json", "utf8"));
const targets = new Set(Object.keys(config.target || {}));
const tags = [];
for (const name of targets) {
  const target = config.target[name];
  if (!target || !Array.isArray(target.tags)) continue;
  for (const tag of target.tags) tags.push(tag);
}
process.stdout.write(tags.join("\n"));
NODE
fi

if [[ "${ORIGAN_CLEAN_CACHE}" == "1" ]]; then
  docker buildx prune -af
fi

resolve_digest() {
  local tag="$1"
  local manifest
  manifest="$(docker buildx imagetools inspect "$tag" --format '{{json .Manifest}}')"
  local digest
  digest="$(node -e 'const fs=require("node:fs");const input=fs.readFileSync(0,"utf8").trim();const parsed=JSON.parse(input);if(!parsed.digest){process.exit(1);}process.stdout.write(parsed.digest);' <<<"$manifest")"
  local repo="${tag%:*}"
  printf '%s@%s' "$repo" "$digest"
}

RUNNER_TAG="${REGISTRY_ENDPOINT}/origan/runner:${IMAGE_TAG}"

if [[ "${ORIGAN_SINGLE_IMAGE}" == "1" ]]; then
  NODE_SERVICES_TAG="${REGISTRY_ENDPOINT}/origan/node-services:${IMAGE_TAG}"
  NODE_SERVICES_DIGEST="$(resolve_digest "$NODE_SERVICES_TAG")"
  CONTROL_API_DIGEST="${NODE_SERVICES_DIGEST}"
  GATEWAY_DIGEST="${NODE_SERVICES_DIGEST}"
  BUILDER_DIGEST="${NODE_SERVICES_DIGEST}"
else
  CONTROL_API_TAG="${REGISTRY_ENDPOINT}/origan/control-api:${IMAGE_TAG}"
  GATEWAY_TAG="${REGISTRY_ENDPOINT}/origan/gateway:${IMAGE_TAG}"
  BUILDER_TAG="${REGISTRY_ENDPOINT}/origan/builder:${IMAGE_TAG}"
  CONTROL_API_DIGEST="$(resolve_digest "$CONTROL_API_TAG")"
  GATEWAY_DIGEST="$(resolve_digest "$GATEWAY_TAG")"
  BUILDER_DIGEST="$(resolve_digest "$BUILDER_TAG")"
fi

RUNNER_DIGEST="$(resolve_digest "$RUNNER_TAG")"

cat <<JSON
{
  "node-services": "${NODE_SERVICES_DIGEST:-}",
  "control-api": "${CONTROL_API_DIGEST}",
  "gateway": "${GATEWAY_DIGEST}",
  "builder": "${BUILDER_DIGEST}",
  "runner": "${RUNNER_DIGEST}"
}
JSON
