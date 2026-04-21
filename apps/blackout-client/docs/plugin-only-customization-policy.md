# Plugin-Only Customization Policy (PR-6 Hardened)

## Status

-   Effective in PR-6 hardening phase.
-   Unknown feature/plugin IDs are now rejected by allowlist manifest + CI gates.

## Policy

1. **No ad hoc shell/runtime customization paths.**
2. **All custom behavior must map to named feature modules or plugin boundaries.**
3. **Shell extension points stay minimal:** only feature composition and plugin registration entrypoints are valid injection points.
4. **Matrix client-server compatibility and federation semantics are preserved:** no protocol contract rewrites for UX-only goals.
5. **Migration remains additive and reversible through feature flags and registration controls.**

## Approved extension points

-   `src/app/core/features/manifest.ts`
-   `src/app/core/features/registry.ts`
-   `src/app/core/features/plugins.ts`
-   `src/app/plugins/manifest.ts`

## Guardrails introduced in PR-6

-   **Registration allowlist manifest:** `featureModuleManifest` and `runtimePluginManifest` are the source of truth for feature/plugin IDs.
-   **CI registration check:** `tools/ci/check-feature-registry.mjs` fails on unknown feature IDs and unknown runtime plugin IDs.
-   **Legacy import gate expansion:** `tools/ci/check-legacy-runtime-imports.mjs` blocks direct legacy customization imports in core runtime paths.
-   **Frontend consolidation gate:** `tools/ci/check-frontend-consolidation-gates.mjs` verifies plugin-only customization documentation inventory.

## Why this is federation-safe

These guardrails only constrain composition/injection boundaries and static imports. They do not alter Matrix SDK contracts, event payload semantics, or protocol behavior.

## Rollout / rollback

-   Rollout: keep guards enabled in CI, then migrate any remaining custom logic behind plugin modules.
-   Rollback: remove/disable the specific guard in a single revert commit while preserving manifest + plugin boundaries.
