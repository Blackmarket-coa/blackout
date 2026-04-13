# Plugin Extension Points

This document defines the **approved plugin extension model** for `apps/blackout-client` during the Cinny-baseline reset and modular reintroduction program.

## Scope and intent

- Preserve Matrix client-server compatibility and federation-safe semantics.
- Keep shell extension points minimal, explicit, and CI-enforced.
- Require all customizations to map to named feature modules or runtime plugins.
- Keep rollback additive and reversible via feature flags and manifest edits.

---

## Approved extension slots

Only the following slots are approved for customization:

1. **Feature module allowlist slot**
   - File: `src/app/core/features/manifest.ts`
   - Contract: `featureModuleManifest` is the single source of truth for allowed feature IDs.
   - Enforcement: CI + registry assertion reject unknown IDs.

2. **Runtime plugin allowlist slot**
   - File: `src/app/core/features/manifest.ts`
   - Contract: `runtimePluginManifest` is the single source of truth for allowed runtime plugin IDs.
   - Enforcement: CI + runtime declaration checks reject unknown IDs.

3. **Feature registry composition slot**
   - File: `src/app/core/features/registry.ts`
   - Contract: `bootstrapFeatures()` composes core + plugin modules only after manifest validation.
   - Restriction: no direct legacy `bmc-*` imports in shell/runtime entrypoints.

4. **Runtime plugin declaration slot**
   - File: `src/app/plugins/manifest.ts`
   - Contract: plugin declarations must map 1:1 to allowlisted runtime plugin IDs.
   - Restriction: declaration-only boundary; no ad hoc side-loading.

5. **UI slot injection boundary**
   - Files: `src/app/plugins/right-panel/panelSlots.tsx` and plugin-specific slot adapters.
   - Contract: typed slot APIs only; no untyped mutation of shell layout trees.

6. **Theme runtime adapter boundary**
   - Files: `src/app/plugins/theme/*` and `src/app/plugins/shell/*`.
   - Contract: presentation-layer transforms only; no Matrix SDK contract rewrites.

7. **Matrix adapter read-only boundary**
   - Files: `src/app/plugins/matrix-adapters/*`.
   - Contract: adapt read/derived state for UI; keep canonical Matrix payload semantics unchanged.

---

## Plugin lifecycle and contracts

### Lifecycle phases

1. **Discover**
   - Runtime declarations loaded from plugin manifest.
2. **Validate**
   - IDs must exist in `runtimePluginManifest`.
3. **Register**
   - Plugin `register()` attaches typed handlers/slots.
4. **Activate**
   - Feature flag gate enables behavior at runtime.
5. **Deactivate**
   - Kill-switch or flag toggle disables plugin behavior without removing code.
6. **Unregister**
   - Plugin `unregister()` detaches handlers/slots and cleans up subscriptions.

### Contract requirements

- Plugins must expose explicit lifecycle hooks (`register` / `unregister`).
- Plugins must be idempotent on repeated registration attempts.
- Plugins must not mutate Matrix event payloads or protocol contracts.
- Plugins must fail closed (disabled) when validation or flag checks fail.
- Plugins must keep side effects bounded to declared slot or adapter boundaries.

---

## Feature flags and kill-switch protocol

### Flag model

- Every reintroduced customization plugin gets a dedicated feature flag.
- Flags are additive; baseline behavior remains default-safe.
- Flags are evaluated before plugin activation and at runtime re-evaluation points.

### Kill-switch protocol

1. **Trigger condition**
   - Regression in timeline/composer/nav behavior, notification drift, or protocol safety concern.
2. **Immediate action**
   - Toggle the plugin’s feature flag to `off` in runtime config.
3. **Verification**
   - Confirm fallback to Cinny-baseline flow and no shell bootstrap failures.
4. **Containment**
   - Keep plugin declarations intact but inactive for quick re-enable after patch.
5. **Post-incident**
   - Record incident, owner, affected plugin ID, and rollback timestamp.

---

## Rollback procedure and ownership map

### Standard rollback procedure

1. Disable affected plugin feature flag(s).
2. Confirm baseline UX parity for login, room list, timeline, and composer.
3. If needed, remove plugin declaration from `src/app/plugins/manifest.ts`.
4. If needed, remove runtime plugin ID from `runtimePluginManifest`.
5. Run CI boundary checks before merge/deploy.

### Ownership map

| Boundary | Primary owner | Backup owner | Responsibility |
| --- | --- | --- | --- |
| Feature + plugin allowlists (`core/features/manifest.ts`) | Client Platform | Release Engineering | Allowlist governance and ID review |
| Feature registry (`core/features/registry.ts`) | Client Platform | Frontend Architecture | Safe composition and bootstrap invariants |
| Plugin declarations (`plugins/manifest.ts`) | Plugin Maintainers | Client Platform | Declared plugin set and load order |
| Theme + shell plugin boundaries (`plugins/theme`, `plugins/shell`) | Design Systems | Client Platform | Theme runtime safety and baseline fallback |
| Matrix adapters (`plugins/matrix-adapters`) | Matrix Integration | Client Platform | Adapter-only transforms, protocol safety |
| CI policy gates (`tools/ci/*`) | Release Engineering | Client Platform | Enforcement and fail-fast quality gates |

---

## File-level before/after rationale and risk notes (this document)

- **Before:** Extension points were documented but not fully explicit about lifecycle, kill-switch protocol, and ownership assignment.
- **After:** Added approved slot inventory, lifecycle contracts, kill-switch flow, rollback runbook, and ownership map aligned to plugin-only customization policy.
- **Risk notes:** Documentation drift risk remains if manifests/contracts evolve without doc updates; mitigate with CI doc-anchor checks and PR checklist enforcement.
