# Origan Deployment Manifest (Static + Dynamic)

## Goals
- Define an Origan-native manifest format that describes both static assets and dynamic handlers.
- Use `urlPath` + `resourcePath` for every entry.
- Support wildcard routing for dynamic handlers.
- Decouple from Nitro while allowing a Nitro generator plugin to emit this manifest.

## Non-goals
- Encode framework-specific features (Nitro, Next, etc.) into the core manifest.
- Rework the runtime or deploy pipeline in this doc; only outline required changes.

## Manifest Schema (Proposed)

```json
{
  "version": 1,
  "resources": [
    {
      "kind": "static",
      "urlPath": "/assets/app.js",
      "resourcePath": "app/assets/app.js",
      "headers": {
        "cache-control": "public, max-age=31536000, immutable"
      }
    },
    {
      "kind": "dynamic",
      "urlPath": "/api/users/:id",
      "resourcePath": "api/users/[id].js",
      "methods": ["GET", "PUT"],
      "wildcard": false
    },
    {
      "kind": "dynamic",
      "urlPath": "/api/*",
      "resourcePath": "api/_catchall.js",
      "methods": ["GET", "POST"],
      "wildcard": true
    }
  ]
}
```

### Fields
- `version`: Manifest version for forward compatibility.
- `resources`: Ordered list of resources.
- `kind`: `static` or `dynamic`.
- `urlPath`: URL mount point. Supports parameter tokens (e.g., `:id`) and catch-all (`*`).
- `resourcePath`: Path to the artifact within the bundle zip.
- `headers`: Optional response headers for static assets (future: also for dynamic).
- `methods`: Optional HTTP methods for dynamic handlers; default is all.
- `wildcard`: Optional, true when `urlPath` contains `*`.

### Routing Rules
- Exact static matches win first.
- Dynamic matches are evaluated next in order, with the most specific match first:
  1) `urlPath` with no wildcards
  2) `urlPath` with `:param`
  3) `urlPath` with `*` (catch-all)
- If multiple matches remain, first in manifest order wins.
- `urlPath` uses forward slashes and is normalized to start with `/`.

### Bundle Layout
- The bundle zip may keep existing top-level `app/` and `api/` folders, but it can be any layout as long as `resourcePath` points to the correct internal path.
- `resourcePath` always points to a path inside the zip (e.g., `app/index.html`, `api/users/[id].js`).

## Generator Plugins

### Nitro v3 generator / preset (implementation plan)
The Nitro generator emits the Origan manifest without changing the manifest format.

Inputs (from Nitro output):
- Public assets output directory (for static assets)
- Server output directory (for handlers)
- Nitro route rules (if any)

Mapping ideas:
- Every static asset in Nitro output => `kind: "static"`, `urlPath` based on public path.
- Server handlers => `kind: "dynamic"`, `urlPath` inferred from file tree.
- Nitro route rules can add `headers` or `methods` to the manifest entries.

- Create an Origan Nitro preset as its own publishable workspace package (not part of the main app structure).
- It should output the bundle layout + `manifest.json`.
- Hook into Nitro build output (public assets + server output) and emit `resources[]` entries.
- Respect Nitro route rules when available (headers, cache, methods).
- Expose config for output layout so `resourcePath` matches actual zip structure.
- Keep it optional so Origan stays framework-agnostic.
- Suggested package: `packages/nitro-preset-origan` published as `@origan/nitro-preset`.
- Entry points: `exports` should expose a preset function (e.g., `preset()`), and optional CLI for manifest generation (`bin/origan-nitro-manifest`).
- Outputs: zip bundle + `manifest.json` in the build output directory.

### Other frameworks
Other frameworks can implement the same contract: produce a bundle zip and a manifest JSON file matching this schema.

## Migration Strategy (Suggested)
- Keep this simple: the platform is not in use yet, so we can switch to the new manifest format directly.
- Introduce a new manifest file in the bundle (e.g., `manifest.json`) and update upload + runtime to consume it.

## Implementation Notes (High level)
- Builder/CLI should emit `manifest.json` inside the zip and also send it in `FormData`.
- Control API validates manifest schema and stores it with the deployment.
- Runner uses the manifest to route requests and locate assets/handlers.
