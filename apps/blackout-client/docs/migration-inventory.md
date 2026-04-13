# Migration Inventory (PR-6 hardening + cleanup)

## Deprecated bridge shim removals

| Deprecated bridge shim                  | Status  | Before rationale                                                                          | After rationale                                                                                                                   | Risk notes                                                                             |
| --------------------------------------- | ------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/app/hooks/bmc-useNotifications.ts` | Removed | Transitional bridge to keep notification adapter rollout reversible during PR-5.          | Runtime notifications now resolve directly via plugin boundary (`src/app/plugins/notifications/*`) and manifest allowlist checks. | Low risk: file had no in-repo imports; behavior remains through plugin adapter path.   |
| `src/app/utils/bmc-event.ts`            | Removed | Temporary utility shim for event-shape helpers while right-panel/room rendering migrated. | Event transforms stay in feature/plugin modules; no standalone legacy bridge shim remains.                                        | Low risk: file had no in-repo imports; helpers duplicated by active runtime utilities. |

## Allowlist + CI hardening inventory

| Boundary                                          | Before                                                                                    | After                                                                                                                          | Risk notes                                                                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `src/app/core/features/manifest.ts`               | Missing single source of truth for feature/plugin allowlist IDs.                          | Added dedicated feature + runtime plugin allowlists with explicit assertion helpers.                                           | Medium risk: new IDs must be added intentionally; mitigated by deterministic checks and tests.               |
| `tools/ci/check-feature-registry.mjs`             | Validated feature registry JSON and legacy `registeredFeatureModuleIds` snapshot parsing. | Validates `featureModuleManifest` and `runtimePluginManifest` + declared runtime plugin entries; fails on unknown plugin IDs.  | Low risk: strictness increases; failures are actionable and additive.                                        |
| `tools/ci/check-legacy-runtime-imports.mjs`       | Blocked legacy paths broadly and limited `bmc-*` checks on a short entrypoint list.       | Blocks direct legacy hook/state/utils/core imports from core runtime paths (`main`, router, client layout, core feature tree). | Medium risk: may catch legitimate transitional imports; keep exceptions explicit via plugin boundaries only. |
| `tools/ci/check-frontend-consolidation-gates.mjs` | Focused on parity/disposition/backlog tables.                                             | Adds plugin-only policy artifact checks + extension-point and migration inventory doc anchors.                                 | Low risk: docs must stay in sync with architecture controls.                                                 |

## Reversibility and feature-flag safety

-   Changes are additive at registry/plugin boundary level.
-   Runtime behavior remains controlled by existing feature flags.
-   Reversal path: remove manifest entries and plugin declarations together; CI catches drift.
