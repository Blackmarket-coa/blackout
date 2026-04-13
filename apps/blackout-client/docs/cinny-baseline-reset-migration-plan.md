# Cinny Baseline Reset + Modular Reintroduction Plan

## Context

The current customized frontend has regressions in spacing, element location, and feature behavior. This plan resets `apps/blackout-client` to a clean Cinny-compatible baseline, then reintroduces Blackout custom behavior strictly through modular feature/plugin boundaries.

### Non-negotiable rules

1. No ad hoc shell hacks.
2. Every customization must map to a named feature module or plugin boundary.
3. Shell extension points remain minimal and documented.
4. Preserve Matrix client-server compatibility and federation-safe semantics.

---

## 1) Migration inventory table (old customization → new module)

| Legacy customization surface (current) | Evidence path(s) | Risk observed | New module / boundary target | Owner | Done when |
|---|---|---|---|---|---|
| BMC core theme/token overlays intertwined with runtime styles | `src/lib/bmc-core/themes.ts`, `src/lib/bmc-core/tokens.ts`, `src/app/styles/theme-engine.ts` | spacing drift, visual inconsistency | `src/app/plugins/theme/runtimeThemePlugin.ts` + `src/app/features/theme/*` | Frontend Platform | Theme package can be toggled off with baseline fallback |
| BMC quick actions mixed with composer/nav behavior | `src/lib/bmc-core/quick-actions.ts`, `src/app/hooks/useMessageSpacing.ts` | misplaced actions, composer regressions | `src/app/plugins/composer/quickActionsPlugin.ts` | Messaging UX | Plugin registration controls all quick-action injection |
| BMC event/room utility overrides in shared utils | `src/app/utils/bmc-event.ts`, `src/app/utils/bmc-room.ts` | functional regressions in timeline/room metadata | `src/app/features/room-metadata/*` behind typed adapters | Realtime UX | No direct `bmc-*` imports in core render path |
| BMC matrix hooks variant usage (`bmc-*` hooks) | `src/app/hooks/bmc-useMatrixClient.ts`, `src/app/hooks/bmc-useTimeline.ts`, `src/app/hooks/bmc-useRoom.ts` | logic divergence from baseline behavior | `src/app/plugins/matrix-adapters/*` + `src/app/core/features/featureFlags.ts` gates | Matrix Integration | Adapter can be disabled without breaking baseline flows |
| Customized notifications wrappers | `src/app/hooks/bmc-useNotifications.ts` | notification state drift | `src/app/plugins/notifications/*` with contract tests | Notifications | parity tests pass against baseline behavior |
| Space hierarchy custom variant | `src/app/hooks/bmc-useSpaceHierarchy.ts` | navigation location regressions | `src/app/plugins/navigation/spaceHierarchyPlugin.ts` | Navigation | sidebar/tree ordering matches approved UX spec |
| Governance and forum-style high-order features | `src/app/features/governance/*`, `src/app/features/forum/*` | high UI coupling risk | Keep as `src/app/features/governance/*`, `src/app/features/forum/*`, loaded only through manifest | Product Features | Features isolated to explicit routes/entrypoints |
| Right panel custom composition | `src/app/features/right-panel/RightPanelContent.tsx` | state leakage and layout shifts | `src/app/plugins/right-panel/*` with slot contract | Room Experience | right panel can be swapped/disabled by feature flag |
| Theme accessibility and previews tied to settings | `src/app/features/settings/theme-parity.test.ts`, `src/app/features/settings/theme-previews.ts` | incomplete parity after theme changes | `src/app/features/theme-settings/*` + plugin contract tests | Settings | theme tests pass with and without plugin |
| Core feature registry currently permissive | `src/app/core/features/registry.ts`, `src/app/core/features/plugins.ts`, `src/app/core/features/composition.ts` | unstructured injection risk | lock registry to allowlist manifests: `src/app/core/features/manifest.ts` | Frontend Platform | CI fails on unregistered module injection |

---

## 2) Staged migration PR plan

## PR-1: Freeze + baseline snapshot
- Create branch snapshot of current customized behavior for diff-only reference.
- Introduce migration guardrails:
  - architecture note in docs
  - import boundary lint rules (`bmc-*` forbidden in core paths)
  - mandatory feature registration checks in CI
- Deliverable: repo can build with existing behavior, but new custom code must enter through registry.

## PR-2: Clean Cinny baseline reset
- Reset primary shell/layout, spacing tokens, and room timeline layout to baseline Cinny defaults.
- Remove direct custom imports from shell entry points.
- Keep custom code compiled but detached behind disabled feature flags.
- Deliverable: stable baseline UX parity for login, room list, timeline, composer.

## PR-3: Theme plugin reintroduction
- Add `theme` plugin package and migrate BMC theme overrides there.
- Expose minimal shell extension point: theme registration only.
- Add visual regression checks for spacing and typography.
- Deliverable: theme customizations on/off toggle with zero functional side effects.

## PR-4: Composer + navigation plugin reintroduction
- Introduce modular plugins for quick actions, message spacing, and space hierarchy behavior.
- Keep Matrix send/edit/redact semantics untouched.
- Add integration tests for composer behavior and nav placement.
- Deliverable: restored UX enhancements without baseline regressions.

## PR-5: Notifications + right-panel plugins
- Migrate notification and right-panel custom logic into dedicated plugins.
- Validate room context synchronization and unread counts.
- Deliverable: custom right-panel and notifications stable and kill-switchable.

## PR-6: Hardening + cleanup
- Remove deprecated `bmc-*` bridge shims not needed after migration.
- Lock CI gates and finalize docs for extension points.
- Deliverable: modular architecture complete; no legacy direct customization paths.

---

## 3) File-level refactor plan

### A. Baseline shell reset (high priority)
- Review and reset shell/layout wiring:
  - `src/app/pages/Router.tsx`
  - `src/app/pages/client/ClientLayout.tsx`
  - `src/app/pages/ThemeManager.tsx`
- Move any direct customization imports out of shell files into plugin registration.

### B. Core feature system hardening
- Harden the feature composition pipeline:
  - `src/app/core/features/types.ts`
  - `src/app/core/features/registry.ts`
  - `src/app/core/features/plugins.ts`
  - `src/app/core/features/composition.ts`
  - `src/app/core/features/buildRegistry.ts`
  - `src/app/core/features/featureFlags.ts`
- Add `src/app/core/features/manifest.ts` as allowlist source of truth.

### C. Plugin package introduction
- Create plugin namespaces:
  - `src/app/plugins/theme/*`
  - `src/app/plugins/composer/*`
  - `src/app/plugins/navigation/*`
  - `src/app/plugins/notifications/*`
  - `src/app/plugins/right-panel/*`
  - `src/app/plugins/matrix-adapters/*`
- Define plugin contracts:
  - lifecycle hooks (register/unregister)
  - read-only Matrix adapter interfaces where possible
  - typed slot APIs for UI injection points

### D. Legacy customization extraction
- Refactor legacy files into plugin-owned modules:
  - `src/lib/bmc-core/*` → split into theme/composer/navigation plugin concerns
  - `src/app/hooks/bmc-*` → adapter/plugin wrappers
  - `src/app/utils/bmc-*` → scoped utility modules under relevant plugin or feature
- Keep temporary bridge files only during staged rollout; remove by PR-6.

### E. Test and CI guardrails
- Add/update boundary and composition tests:
  - `tests/unit/core/features/composition.test.ts`
  - `tests/unit/core/features/manifestContract.test.ts`
  - `tests/unit/pages/client/ClientLayout.test.tsx`
- Add CI scripts:
  - `tools/ci/check-feature-registry.mjs` (strengthen)
  - `tools/ci/check-frontend-consolidation-gates.mjs` (extend for plugin-only customizations)
  - `tools/ci/check-legacy-runtime-imports.mjs` (add forbidden legacy import matrix)

### F. Documentation of extension points
- Document minimal shell extension points and plugin contracts:
  - `apps/blackout-client/docs/plugin-extension-points.md`
  - `apps/blackout-client/docs/migration-inventory.md`

---

## 4) Regression test plan

## A. Functional smoke (must pass each PR)

1. Authentication flow
   - login/logout/session restore
2. Room timeline
   - load timeline, paginate, send/edit/redact/reply/react
3. Navigation and layout
   - home/direct/space switching, right-panel toggles
4. Settings
   - open settings, change theme, notification settings persistence
5. Media and calls
   - image/file send-preview, voice/video call setup availability indicators

## B. Baseline parity tests (reset safety)

- Compare baseline snapshots before/after reset for:
  - spacing tokens
  - component alignment
  - core interaction locations (composer, room actions, nav controls)
- Ensure plugin-disabled mode equals clean baseline behavior.

## C. Modularity tests

- Validate each plugin can be:
  - enabled independently
  - disabled independently
  - loaded in deterministic order via manifest
- Assert no plugin mutates Matrix protocol payload shapes.

## D. Boundary enforcement tests

- Static analysis checks:
  - forbid direct imports from `bmc-*` into core shell and Matrix runtime entry files
  - forbid direct Stoat runtime/protocol imports in client path
- Contract tests:
  - feature registry rejects unknown plugin IDs
  - shell only consumes documented extension slots

## E. Release gate checklist

A release candidate passes only if:
1. Functional smoke suite passes in plugin-disabled baseline mode.
2. Functional smoke suite passes in full-feature mode.
3. Boundary/registry CI checks pass.
4. No Sev-1 or Sev-2 regressions in spacing/location/functionality in staging signoff.

---

## Implementation notes

- Keep migration additive and reversible via feature flags.
- Prefer removing customization from shell first, then reintroducing module-by-module.
- Do not rewrite Matrix SDK contracts for UX goals; use adapters and presentation-layer transforms only.
