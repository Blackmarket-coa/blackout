# Plugin Extension Points (PR-6 hardened)

This document defines the **only approved customization boundaries** for `apps/blackout-client`.

## Core allowlist boundaries

1. `src/app/core/features/manifest.ts`
    - `featureModuleManifest` is the allowlist for feature module IDs.
    - `runtimePluginManifest` is the allowlist for runtime plugin IDs.
2. `src/app/core/features/registry.ts`
    - Core + plugin modules are validated against `featureModuleManifest` before registry build.
3. `src/app/plugins/manifest.ts`
    - Runtime plugin declarations are validated against `runtimePluginManifest`.

Unknown IDs are rejected in CI and at runtime bootstrap.

## Minimal shell extension points

Shell/runtime extension points remain intentionally small:

-   `bootstrapFeatures(manifest)` (feature registry composition only)
-   Runtime plugin declarations in `src/app/plugins/manifest.ts`
-   Typed plugin slot APIs (composer/navigation/notifications/right-panel)

No direct shell/runtime import path may consume legacy `bmc-*` bridge modules.

## Plugin-only customization policy mapping

-   Feature ID registration: `tools/ci/check-feature-registry.mjs`
-   Legacy runtime import gate: `tools/ci/check-legacy-runtime-imports.mjs`
-   Frontend consolidation + documentation gates: `tools/ci/check-frontend-consolidation-gates.mjs`

## Matrix compatibility guardrail

All plugin customizations are presentation/adaptation-only:

-   preserve canonical Matrix event payload semantics,
-   avoid federated protocol mutations,
-   use adapters/slot transforms instead of SDK contract rewrites.
