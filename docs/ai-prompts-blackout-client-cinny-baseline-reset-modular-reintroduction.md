# Blackout Client: Cinny Baseline Reset + Modular Reintroduction (AI Prompt Plan)

## Purpose

This document provides a staged migration plan and **ready-to-run AI prompts** for moving `apps/blackout-client` from a tightly coupled customization model to a Cinny-compatible baseline with modular plugin reintroduction.

The plan enforces:
- No ad hoc shell/runtime customization paths.
- All custom behavior behind named feature/plugin boundaries.
- Minimal, documented shell extension points.
- Matrix compatibility and federation-safe semantics.

---

## Global operating constraints for all prompts

Use this preamble in every implementation prompt:

```md
You are implementing changes in apps/blackout-client.
Hard rules:
1) No ad hoc shell hacks.
2) Every customization must map to a named feature module or plugin boundary.
3) Shell extension points must remain minimal and documented.
4) Preserve Matrix client-server compatibility and federation-safe semantics.
5) Keep migration additive and reversible via feature flags.
6) Do not rewrite Matrix SDK contracts for UX goals; use adapters and presentation-layer transforms only.
7) For each file touched, include before/after rationale and risk notes.
8) Add or update tests for each boundary changed.
```

---

## 1) Migration inventory mapping (execution targets)

| Legacy surface | Evidence path(s) | Risk observed | New target module/boundary | Done when |
|---|---|---|---|---|
| BMC theme/token overlays intertwined with runtime styles | `src/lib/bmc-core/themes.ts`, `src/lib/bmc-core/tokens.ts`, `src/app/styles/theme-engine.ts` | spacing drift, visual inconsistency | `src/app/plugins/theme/runtimeThemePlugin.ts` + `src/app/features/theme/*` | Theme package toggle-off falls back to baseline |
| BMC quick actions mixed with composer/nav behavior | `src/lib/bmc-core/quick-actions.ts`, `src/app/hooks/useMessageSpacing.ts` | action placement/composer regressions | `src/app/plugins/composer/quickActionsPlugin.ts` | Plugin registration controls all quick-action injection |
| BMC event/room overrides in shared utils | `src/app/utils/bmc-event.ts`, `src/app/utils/bmc-room.ts` | timeline/metadata regressions | `src/app/features/room-metadata/*` via typed adapters | No direct `bmc-*` imports in core render path |
| BMC matrix hooks variants | `src/app/hooks/bmc-useMatrixClient.ts`, `src/app/hooks/bmc-useTimeline.ts`, `src/app/hooks/bmc-useRoom.ts` | logic divergence from baseline | `src/app/plugins/matrix-adapters/*` + `featureFlags` gates | Adapter disable does not break baseline flows |
| Customized notifications wrappers | `src/app/hooks/bmc-useNotifications.ts` | state drift | `src/app/plugins/notifications/*` + contract tests | Baseline parity tests pass |
| Space hierarchy custom variant | `src/app/hooks/bmc-useSpaceHierarchy.ts` | nav location regressions | `src/app/plugins/navigation/spaceHierarchyPlugin.ts` | sidebar/tree ordering matches UX spec |
| Governance/forum high-order features | `src/app/features/governance/*`, `src/app/features/forum/*` | coupling risk | keep as features, route/entrypoint manifest only | isolated and manifest-driven loading |
| Right panel custom composition | `src/app/features/right-panel/RightPanelContent.tsx` | state leakage/layout shifts | `src/app/plugins/right-panel/*` with slot contract | swappable/disable-able by feature flag |
| Theme accessibility/previews tied to settings | `src/app/features/settings/theme-parity.test.ts`, `src/app/features/settings/theme-previews.ts` | parity gaps | `src/app/features/theme-settings/*` + plugin contract tests | theme tests pass with/without plugin |
| Permissive feature registry | `src/app/core/features/registry.ts`, `plugins.ts`, `composition.ts` | unstructured injection | allowlist manifest in `src/app/core/features/manifest.ts` | CI rejects unregistered injection |

---

## 2) Staged PR plan + AI prompts

## PR-1: Freeze + baseline snapshot

### Goal
Add guardrails while preserving current behavior.

### AI Prompt
```md
Implement PR-1 (Freeze + baseline snapshot) in apps/blackout-client.

Deliverables:
1) Add architecture note documenting plugin-only customization policy.
2) Add lint/static rules forbidding direct `bmc-*` imports in core paths (shell/runtime entrypoints).
3) Enforce feature registration checks in CI so unregistered modules fail builds.
4) Keep runtime behavior unchanged; this PR is guardrails-only.

Primary files:
- docs migration/architecture note (new)
- src/app/core/features/registry.ts
- src/app/core/features/plugins.ts
- src/app/core/features/composition.ts
- tools/ci/check-feature-registry.mjs
- tools/ci/check-legacy-runtime-imports.mjs (new or expanded)

Requirements:
- Do not detach existing features yet.
- Add tests proving CI/lint gates catch unregistered injection.
- Provide a risk table and rollback steps in PR description.
```

---

## PR-2: Clean Cinny baseline reset

### Goal
Reset shell/layout and detach custom imports from entrypoints.

### AI Prompt
```md
Implement PR-2 (Clean Cinny baseline reset) in apps/blackout-client.

Deliverables:
1) Reset primary shell/layout, spacing tokens, and room timeline layout to baseline Cinny defaults.
2) Remove direct customization imports from shell entrypoints.
3) Keep custom modules compiling, but detached and disabled by feature flags.
4) Baseline UX parity must hold for login, room list, timeline, composer.

Priority files:
- src/app/pages/Router.tsx
- src/app/pages/client/ClientLayout.tsx
- src/app/pages/ThemeManager.tsx
- src/app/core/features/featureFlags.ts

Requirements:
- No deletion of custom modules yet unless dead-code safe.
- Add/refresh parity tests for shell layout and timeline/composer placement.
- Output explicit list of disabled flags introduced.
```

---

## PR-3: Theme plugin reintroduction

### Goal
Reintroduce theme customization only through theme plugin boundary.

### AI Prompt
```md
Implement PR-3 (Theme plugin reintroduction) in apps/blackout-client.

Deliverables:
1) Create `src/app/plugins/theme/*` including `runtimeThemePlugin.ts`.
2) Migrate BMC theme/token overrides from legacy locations to plugin-owned modules.
3) Expose minimal shell extension point for theme registration only.
4) Add visual regression checks for spacing + typography.
5) Add kill-switch feature flag and prove baseline fallback works.

Migration sources:
- src/lib/bmc-core/themes.ts
- src/lib/bmc-core/tokens.ts
- src/app/styles/theme-engine.ts

Requirements:
- No functional behavior changes outside theme.
- Add plugin contract tests and settings parity tests.
```

---

## PR-4: Composer + navigation plugins

### Goal
Restore UX enhancements via modular plugins, preserving Matrix semantics.

### AI Prompt
```md
Implement PR-4 (Composer + navigation plugin reintroduction) in apps/blackout-client.

Deliverables:
1) Introduce composer plugin (`src/app/plugins/composer/*`) for quick actions and message spacing behavior.
2) Introduce navigation plugin (`src/app/plugins/navigation/*`) for space hierarchy behavior.
3) Ensure Matrix send/edit/redact payload semantics are unchanged.
4) Add integration tests for composer behavior and nav placement.

Migration sources:
- src/lib/bmc-core/quick-actions.ts
- src/app/hooks/useMessageSpacing.ts
- src/app/hooks/bmc-useSpaceHierarchy.ts

Requirements:
- Deterministic plugin load order through manifest.
- Clear on/off toggles per plugin.
```

---

## PR-5: Notifications + right-panel plugins

### Goal
Modularize notification and right-panel customization behind plugin contracts.

### AI Prompt
```md
Implement PR-5 (Notifications + right-panel plugin reintroduction) in apps/blackout-client.

Deliverables:
1) Migrate notification logic to `src/app/plugins/notifications/*`.
2) Migrate right-panel composition to `src/app/plugins/right-panel/*` using typed slot APIs.
3) Validate room context sync and unread count correctness.
4) Add kill-switch flags and contract tests for both plugins.

Migration sources:
- src/app/hooks/bmc-useNotifications.ts
- src/app/features/right-panel/RightPanelContent.tsx

Requirements:
- No state leakage across room transitions.
- Plugin-disabled behavior must match PR-2 baseline.
```

---

## PR-6: Hardening + cleanup

### Goal
Remove legacy bridges, finalize registry/manifest lock and docs.

### AI Prompt
```md
Implement PR-6 (Hardening + cleanup) in apps/blackout-client.

Deliverables:
1) Remove deprecated `bmc-*` bridge shims no longer required.
2) Finalize allowlist manifest enforcement (`src/app/core/features/manifest.ts`).
3) Tighten CI gates for plugin-only customization paths.
4) Complete extension-point docs and migration inventory docs.

Primary files:
- src/app/core/features/manifest.ts
- tools/ci/check-feature-registry.mjs
- tools/ci/check-frontend-consolidation-gates.mjs
- tools/ci/check-legacy-runtime-imports.mjs
- apps/blackout-client/docs/plugin-extension-points.md
- apps/blackout-client/docs/migration-inventory.md

Requirements:
- CI fails on unknown plugin IDs.
- No direct legacy customization imports in core runtime path.
```

---

## 3) File-level refactor prompts (by workstream)

## A. Baseline shell reset
```md
Refactor shell/layout wiring to baseline Cinny defaults.
- Audit Router.tsx, ClientLayout.tsx, ThemeManager.tsx.
- Remove direct custom imports from shell files.
- Move customization registration into plugin manifest/bootstrap only.
- Add tests for baseline shell layout parity.
```

## B. Core feature-system hardening
```md
Harden composition pipeline.
- Update types.ts, registry.ts, plugins.ts, composition.ts, buildRegistry.ts, featureFlags.ts.
- Add manifest.ts as allowlist source of truth.
- Enforce deterministic plugin ordering and unknown-ID rejection.
- Add unit tests for manifest contract and composition order.
```

## C. Plugin package introduction
```md
Create plugin namespaces:
- src/app/plugins/theme/*
- src/app/plugins/composer/*
- src/app/plugins/navigation/*
- src/app/plugins/notifications/*
- src/app/plugins/right-panel/*
- src/app/plugins/matrix-adapters/*

Define contracts:
- register/unregister lifecycle hooks
- typed slot APIs for UI injection
- read-only Matrix adapter interfaces where possible
```

## D. Legacy extraction
```md
Extract legacy customization into plugin-owned modules.
- Split src/lib/bmc-core/* by plugin concern.
- Convert src/app/hooks/bmc-* to plugin adapter wrappers.
- Move src/app/utils/bmc-* into scoped feature/plugin utility modules.
- Keep temporary bridge files only if flagged and scheduled for deletion by PR-6.
```

## E. Test/CI guardrails
```md
Add and enforce boundary tests + CI checks.
- tests/unit/core/features/composition.test.ts
- tests/unit/core/features/manifestContract.test.ts
- tests/unit/pages/client/ClientLayout.test.tsx
- tools/ci/check-feature-registry.mjs
- tools/ci/check-frontend-consolidation-gates.mjs
- tools/ci/check-legacy-runtime-imports.mjs

Checks:
- forbid bmc-* direct imports into core shell/runtime entrypoints
- reject unknown plugin IDs
- require plugin-only customization paths
```

## F. Extension-point documentation
```md
Write two docs:
1) plugin-extension-points.md
2) migration-inventory.md

Must include:
- approved extension slots
- plugin lifecycle and contracts
- feature flags and kill-switch protocol
- rollback procedure and ownership map
```

---

## 4) Regression test plan prompts

## A. Functional smoke (every PR)
```md
Run smoke tests in both modes:
1) plugin-disabled baseline
2) full-feature mode

Cover:
- auth (login/logout/session restore)
- timeline (load/paginate/send/edit/redact/reply/react)
- navigation/layout (home/direct/space switching, right panel toggle)
- settings (theme/notification persistence)
- media/calls (send preview + call setup availability indicators)

Output a pass/fail matrix by scenario and mode.
```

## B. Baseline parity (reset safety)
```md
Compare baseline snapshots before/after reset.
Assert parity for:
- spacing tokens
- component alignment
- core control locations (composer/room actions/nav controls)

Explicitly assert plugin-disabled mode == clean baseline behavior.
```

## C. Modularity tests
```md
Verify each plugin can be:
- enabled independently
- disabled independently
- loaded in deterministic order via manifest

Add assertion that no plugin mutates Matrix protocol payload shapes.
```

## D. Boundary enforcement
```md
Static checks:
- forbid direct bmc-* imports into core shell/runtime entrypoints
- forbid direct Stoat runtime/protocol imports in client path

Contract checks:
- registry rejects unknown plugin IDs
- shell consumes documented extension slots only
```

## E. Release gate
```md
Block release unless all pass:
1) smoke suite passes in plugin-disabled baseline mode
2) smoke suite passes in full-feature mode
3) boundary/registry CI checks pass
4) staging signoff reports no Sev-1/Sev-2 regressions for spacing/location/functionality
```

---

## 5) Suggested execution cadence

- Sprint 1: PR-1 + PR-2 (guardrails + reset).
- Sprint 2: PR-3 + PR-4 (theme/composer/navigation plugin return).
- Sprint 3: PR-5 + PR-6 (notifications/right-panel + hardening).

Each PR should include:
- feature flag defaults,
- kill-switch instructions,
- risk/rollback notes,
- proof of plugin-disabled baseline parity.
