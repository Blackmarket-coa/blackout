# Cinny Baseline Reset + Modular Reintroduction Plan

## Goal

Stabilize `apps/blackout-client` by restoring a clean Cinny shell/layout baseline first, then reintroducing Blackout-specific behavior only through explicit feature modules/plugins.

## Architectural guardrails (non-negotiable)

1. **No ad hoc custom logic in shell** (`main.tsx`, router, root layout, room shell).
2. **Every customization must be owned by one module boundary** (`features/*` or `plugins/*`).
3. **Shell extension points are minimal and documented** (fixed slot interfaces + typed contracts).
4. **Matrix compatibility is preserved** (event schemas, sync semantics, room/account data shape, and client-server API behavior must remain baseline-safe).

---

## 1) Migration inventory (old customization → new module)

| Legacy customization (current state) | Current location(s) | Instability observed | New module/plugin boundary | Shell touchpoint (allowed) | Matrix compatibility requirement |
|---|---|---|---|---|---|
| BMC theme tokens + runtime style overrides mixed into app runtime | `src/lib/bmc-core/themes.ts`, `src/lib/bmc-core/tokens.ts`, `src/app/styles/theme-engine.ts` | spacing drift, inconsistent density, visual regressions | `src/app/plugins/theme/runtimeThemePlugin.ts` + `src/app/features/theme/*` | `ThemeSlot.registerThemePack()` only | No protocol impact; presentation-only transforms |
| Quick actions + composer behavior changes blended with core composer | `src/lib/bmc-core/quick-actions.ts`, composer hooks/components | button location regressions, action state bugs | `src/app/plugins/composer/quickActionsPlugin.ts` | `ComposerSlot.registerActions()` | Message payload schema unchanged (`m.room.message` parity) |
| BMC room/event utility overrides in shared runtime utils | `src/app/utils/bmc-room.ts`, `src/app/utils/bmc-event.ts` | timeline rendering/metadata drift | `src/app/plugins/matrix-adapters/roomMetadataAdapter.ts` | `MatrixAdapterSlot.registerRoomMetadataAdapter()` | Adapter cannot mutate canonical event content |
| BMC hook forks for Matrix client/timeline/space hierarchy | `src/app/hooks/bmc-useMatrixClient.ts`, `src/app/hooks/bmc-useTimeline.ts`, `src/app/hooks/bmc-useSpaceHierarchy.ts` | behavior divergence from baseline sync/navigation | `src/app/plugins/matrix-adapters/*`, `src/app/plugins/navigation/spaceHierarchyPlugin.ts` | `NavigationSlot.registerSpaceTreeDecorator()` | Same sync timeline ordering guarantees as baseline |
| Notification wrappers with custom state plumbing | `src/app/hooks/bmc-useNotifications.ts`, related state atoms | unread/notification mismatch | `src/app/plugins/notifications/*` | `NotificationSlot.registerRuleAugmenter()` | Notification state must map 1:1 to Matrix receipt/account-data semantics |
| Right-panel custom composition coupled to room shell | `src/app/features/right-panel/RightPanelContent.tsx` and shell imports | layout shifts, stale room-context leaks | `src/app/plugins/right-panel/*` | `RightPanelSlot.registerPanels()` | Read-only room/event consumption; no event mutation |
| Governance/forum UX features with broad runtime coupling | `src/app/features/governance/*`, `src/app/features/forum/*` | unintended cross-surface side effects | Keep in `features/*`, mounted through feature manifest only | Route/feature manifest registration only | Any Matrix write path covered by contract tests |
| Video-game-like organization UX (lobby routing, room organization toggles, space-scoped grouping) | `src/app/pages/Router.tsx`, `src/app/pages/paths.ts`, `src/app/pages/client/space/Space.tsx`, `src/app/pages/client/ClientLayout.tsx` | navigation inconsistency, room grouping regressions | `src/app/plugins/navigation/organizationPlugin.ts` + `src/app/features/lobby/*` | `NavigationSlot.registerOrganizationPolicy()` | Must preserve Matrix room graph semantics (`m.space.child`, membership, room visibility) |
| Blackout elements registry-driven UI surfaces (feature cards, lobby elements, discovery elements) | `docs/blackout-elements-registry.json`, `src/app/features/*` consumers | element-level drift and inconsistent placement | `src/app/features/elements/*` + `src/app/core/features/manifest.ts` IDs | `ElementSlot.registerElementRenderer()` | Registry IDs stable; no protocol-layer assumptions in element renderer |
| Quick action variants across composer/timeline/header | `src/lib/bmc-core/quick-actions.ts`, quick-action entrypoints in composer/timeline/header components | missing/duplicated quick actions, unstable ordering | `src/app/plugins/composer/quickActionsPlugin.ts` + `src/app/plugins/room-header/quickActionsBridge.ts` | `QuickActionSlot.register({ scope, id, handler })` | action handlers cannot alter Matrix event schema or authz semantics |
| Permissive plugin/feature registry allowing implicit injection | `src/app/core/features/registry.ts`, `composition.ts`, `buildRegistry.ts` | non-deterministic module load order | `src/app/core/features/manifest.ts` as allowlist source of truth | `bootstrapFeatures(manifest)` only | Unknown modules rejected at build/test time |

---

## 2) Staged migration PR plan

### PR-1: Baseline protection rails (no UX reset yet)

**Scope**
- Add hard boundaries for shell and feature registry.
- Introduce/strengthen CI checks to block legacy direct imports.
- Add architecture docs for extension points.

**Acceptance criteria**
- Build unchanged functionally.
- CI fails if custom code bypasses feature/plugin registration.

---

### PR-2: Clean Cinny baseline reset

**Scope**
- Reset shell/layout/spacing/room chrome to Cinny baseline behavior.
- Remove direct custom imports from shell entrypoints.
- Keep custom modules compiled but feature-flagged off.

**Acceptance criteria**
- Baseline mode passes smoke tests for auth, room list, timeline, composer.
- Spacing/location regressions eliminated in baseline mode.

---

### PR-3: Theme plugin reintroduction

**Scope**
- Reintroduce theming as isolated plugin package.
- Register through one theme slot API.

**Acceptance criteria**
- Theme plugin can be toggled on/off without shell change.
- No functional regressions in messaging/navigation.

---

### PR-4: Composer + navigation plugin reintroduction

**Scope**
- Migrate quick-actions/composer enhancements into composer plugin.
- Migrate space hierarchy/nav shaping into navigation plugin.

**Acceptance criteria**
- Composer/nav UX enhancements restored.
- Matrix send/edit/redact semantics unchanged.

---

### PR-5: Notifications + right-panel plugin reintroduction

**Scope**
- Migrate notification customization and right-panel extensions.
- Add per-plugin kill switch and deterministic load ordering.

**Acceptance criteria**
- Notifications and right panel stable under toggle + hot navigation.
- No unread/receipt parity regressions.

---

### PR-6: Legacy bridge removal + hardening

**Scope**
- Remove temporary `bmc-*` bridge shims.
- Finalize extension-point docs and enforce allowlist manifest.

**Acceptance criteria**
- No direct legacy customization imports in core shell/runtime.
- All customizations discoverable from manifest + module registry.

---

## 3) File-level refactor plan

### A. Baseline shell reset files (customization removed from shell)

- `src/main.tsx`
- `src/app/pages/Router.tsx`
- `src/app/pages/client/ClientLayout.tsx`
- `src/app/pages/ThemeManager.tsx`

**Action:** strip direct custom imports and consume only typed extension slots.

### B. Feature composition/registry hardening

- `src/app/core/features/types.ts`
- `src/app/core/features/registry.ts`
- `src/app/core/features/composition.ts`
- `src/app/core/features/buildRegistry.ts`
- `src/app/core/features/featureFlags.ts`
- `src/app/core/features/coreModules.ts`
- `src/app/core/features/manifest.ts` (**new**)

**Action:** enforce allowlist registration, deterministic order, unknown-module rejection.

### B1. Inventory completeness controls (elements + quick actions)

- `docs/blackout-elements-registry.json`
- `tools/ci/check-feature-registry.mjs`
- `tools/ci/check-feature-ui-test-coverage.mjs`
- `tools/ci/check-preset-complete-features.mjs`

**Action:** fail CI when any registered element or quick action does not map to a manifest-backed feature/plugin module.

### C. Plugin boundaries (new or refactored)

- `src/app/plugins/theme/*`
- `src/app/plugins/composer/*`
- `src/app/plugins/navigation/*`
- `src/app/plugins/navigation/organizationPlugin.ts`
- `src/app/plugins/notifications/*`
- `src/app/plugins/right-panel/*`
- `src/app/plugins/matrix-adapters/*`
- `src/app/plugins/room-header/*`

**Action:** implement `register/unregister`, typed slot contracts, and read-only Matrix adapters.

### D. Legacy extraction targets

- `src/lib/bmc-core/*` (split by concern into plugin packages)
- `src/app/hooks/bmc-*` (replace with adapter/plugin-facing wrappers)
- `src/app/utils/bmc-*` (move to scoped plugin internals)

**Action:** keep transitional bridges only through PR-5; delete in PR-6.

### E. CI and contract checks

- `tools/ci/check-feature-registry.mjs`
- `tools/ci/check-legacy-runtime-imports.mjs`
- `tools/ci/check-frontend-consolidation-gates.mjs`
- `tests/unit/core/features/composition.test.ts` (**new/expanded**)
- `tests/unit/core/features/manifestContract.test.ts` (**new**)
- `tests/unit/pages/client/ClientLayout.test.tsx` (**expanded**)

**Action:** fail CI on unauthorized imports, non-manifest modules, or unstable load order.

### F. Documentation (minimal extension points)

- `apps/blackout-client/docs/plugin-extension-points.md` (**new**)
- `apps/blackout-client/docs/cinny-baseline-reset-migration-plan.md` (this plan)
- `apps/blackout-client/docs/stoat-inspired-ux-plan.md` (**new**, Stoat-inspired UX without Stoat runtime deps)

**Action:** document only approved shell slots and their contracts.

---

## 4) Regression test plan

### A. Baseline-mode smoke suite (plugins OFF)

1. Authentication: login/logout/session restore.
2. Room list + navigation: home/direct/space transitions.
3. Timeline: paginate/send/edit/redact/reply/react.
4. Composer UX: drafts, upload, mentions, keyboard actions.
5. Settings: theme/notification settings open + persist.
6. Organization baseline: lobby route and room-organization selector behave as baseline defaults.

**Pass condition:** baseline behavior matches clean Cinny expectations.

### B. Full-feature smoke suite (plugins ON)

Run the same suite with all approved plugins enabled.

**Pass condition:** no regressions vs baseline in core workflows; only intended UX additions visible.

Additional checks:
- organization plugin keeps room grouping deterministic across space/all scopes,
- lobby navigation remains stable with quick actions enabled.

### C. Plugin isolation matrix

For each plugin (`theme`, `composer`, `navigation`, `notifications`, `right-panel`, `matrix-adapters`, `room-header`):
- enabled alone,
- disabled alone,
- enabled in canonical order,
- enabled in randomized order (test should assert canonical reordering).

**Pass condition:** deterministic startup and no cross-plugin breakage.

### D. Matrix compatibility contract tests

- Verify outbound event payloads remain canonical for message/edit/reaction/redaction.
- Verify receipts/read markers/account-data mappings remain baseline-compatible.
- Verify no plugin mutates sync response objects in-place.

**Pass condition:** protocol-level fixtures match baseline snapshot.

### E. Visual/layout regression checks

- Snapshot critical screens: room list, timeline, composer, right panel, settings.
- Diff spacing/positioning in baseline mode and plugin-on mode.

**Pass condition:** no unintended spacing/location drift.

### F. Release gating checklist

Release candidate is eligible only if:
1. Baseline-mode smoke passes.
2. Full-feature smoke passes.
3. Matrix compatibility contracts pass.
4. Boundary/registry CI checks pass.
5. Product signoff reports no Sev-1/Sev-2 spacing/location/function regressions.
6. Elements inventory and quick-actions inventory are 100% mapped to manifest-backed modules.

Execution entrypoint:
- `pnpm guard:blackout-client-release-gate`
- Optional override for staged evidence file: `--staging-signoff <path>`

Staging signoff contract:
- Default source: `apps/blackout-client/docs/release/staging-signoff.json`
- Required assertions:
  - `summary.sev1 === 0`
  - `summary.sev2 === 0`
  - `regressions.spacing === false`
  - `regressions.location === false`
  - `regressions.functionality === false`

---

## Notes for implementation sequencing

- Reintroduce custom behavior **only after** baseline mode is stable.
- Prefer additive feature flags and reversible module cutovers.
- Keep shell APIs small: slot registration and manifest bootstrapping only.
- Treat Matrix protocol surfaces as immutable contracts; customize via adapters and presentation layers.
