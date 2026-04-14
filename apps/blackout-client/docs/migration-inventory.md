# Migration Inventory

This inventory tracks the migration from legacy BMC-coupled customizations to **manifest-governed feature modules and plugins** in `apps/blackout-client`.

## Migration principles

- Additive and reversible through feature flags.
- No ad hoc shell hacks or runtime side-loading.
- Preserve Matrix protocol semantics; only adapter/presentation transforms are allowed.
- CI must fail on unknown IDs or prohibited legacy runtime imports.

---

## Inventory: legacy surface -> modular boundary

| Legacy surface | Evidence path(s) | New boundary | Flag / kill-switch | Reversible rollback path | Owner |
| --- | --- | --- | --- | --- | --- |
| Theme/token overlays coupled to runtime shell | `src/lib/bmc-core/themes.ts`, `src/lib/bmc-core/tokens.ts`, `src/app/styles/theme-engine.ts` | `src/app/plugins/theme/*` + `src/app/plugins/shell/*` | `theme_plugin_enabled` (example naming) | Disable flag -> fallback baseline theme; optionally remove plugin manifest entry | Design Systems |
| Quick actions + spacing mixed into composer behavior | `src/lib/bmc-core/quick-actions.ts`, `src/app/hooks/useMessageSpacing.ts` | `src/app/plugins/composer/*` | `composer_quick_actions_enabled` | Disable flag -> baseline composer; keep plugin code detached | Messaging UX |
| Space hierarchy custom navigation path | `src/app/hooks/bmc-useSpaceHierarchy.ts` | `src/app/plugins/navigation/*` | `space_hierarchy_plugin_enabled` | Disable flag -> baseline navigation tree | Navigation UX |
| Notification wrappers diverging from baseline hooks | `src/app/hooks/bmc-useNotifications.ts` | `src/app/plugins/notifications/*` | `notifications_plugin_enabled` | Disable flag -> baseline notification behavior | Notifications |
| Deprecated bridge shim coverage | `src/app/utils/Deprecated bridge shim`, `src/app/utils/bmc-event.ts` | `src/app/core/features/*` plugin-safe event interfaces | `strict_manifest_enforcement` | Disable plugin shims and fallback to baseline event contracts | Client Platform |
| Right panel custom composition | `src/app/features/right-panel/RightPanelContent.tsx` | `src/app/plugins/right-panel/*` slot contracts | `right_panel_plugin_enabled` | Disable flag -> baseline panel composition | Room Experience |
| BMC Matrix hook variants | `src/app/hooks/bmc-useMatrixClient.ts`, `src/app/hooks/bmc-useTimeline.ts`, `src/app/hooks/bmc-useRoom.ts` | `src/app/plugins/matrix-adapters/*` | `matrix_adapter_plugin_enabled` | Disable flag -> baseline SDK usage path | Matrix Integration |
| Permissive feature/runtime injection | `src/app/core/features/registry.ts`, `src/app/core/features/plugins.ts`, `src/app/core/features/composition.ts` | `src/app/core/features/manifest.ts` + CI checks | `strict_manifest_enforcement` (release-level) | Revert manifest/declaration deltas; preserve baseline feature set | Client Platform |

> Note: Flag names should match implementation constants in `src/app/core/features/featureFlags.ts`; table names are inventory aliases.

---

## Approved extension slots (inventory view)

1. `featureModuleManifest` allowlist slot.
2. `runtimePluginManifest` allowlist slot.
3. `bootstrapFeatures()` validated composition slot.
4. `src/app/plugins/manifest.ts` runtime declaration slot.
5. Typed UI slot APIs (e.g., right panel).
6. Theme/shell adapter slot.
7. Matrix read-only adapter slot.

Any extension outside these slots is out-of-policy.

---

## Plugin lifecycle and contracts (inventory control points)

- **Declare:** plugin appears in runtime manifest.
- **Validate:** allowlist ID match required.
- **Register:** lifecycle `register()` called.
- **Activate:** feature flag on.
- **Deactivate:** feature flag off / kill-switch event.
- **Unregister:** lifecycle `unregister()` called and side effects removed.

Required controls per plugin:
- Contract tests for register/unregister behavior.
- Flag-on and flag-off behavior tests.
- Baseline parity test demonstrating safe fallback.

---

## Feature flags and kill-switch protocol

### Global protocol

1. Detect regression.
2. Toggle plugin-specific kill-switch flag off.
3. Verify baseline parity paths (login, room list, timeline, composer).
4. File incident with plugin ID, owner, UTC timestamp, and user impact.
5. Re-enable only after contract/parity tests pass.

### Release controls

- Emergency release may disable all optional plugins via environment-level flag bundle.
- Manifest edits are secondary rollback only when flag deactivation is insufficient.

---

## Rollback procedure and ownership map

### Rollback tiers

- **Tier 0 (fast):** disable plugin flag.
- **Tier 1 (safe):** disable plugin flag + remove runtime plugin declaration.
- **Tier 2 (structural):** remove plugin manifest ID and plugin module registration, then run CI gates.

### Ownership map

| Domain | Primary owner | Backup owner | Escalation SLA |
| --- | --- | --- | --- |
| Theme + shell plugins | Design Systems | Client Platform | 4 hours |
| Composer + navigation plugins | Messaging UX | Client Platform | 4 hours |
| Notifications + right panel plugins | Room Experience | Client Platform | 4 hours |
| Matrix adapters | Matrix Integration | Client Platform | 2 hours |
| Manifest + CI enforcement | Client Platform | Release Engineering | 2 hours |

---

## Boundary change notes (before/after rationale and risk)

### `apps/blackout-client/docs/plugin-extension-points.md`
- **Before:** Documented allowlist boundaries at a high level but lacked explicit lifecycle/ownership/kill-switch details.
- **After:** Defines approved slots, lifecycle contracts, kill-switch protocol, rollback steps, and owner responsibilities.
- **Risk notes:** Potential mismatch with future plugin contract evolution if not updated alongside code changes.

### `apps/blackout-client/docs/migration-inventory.md`
- **Before:** Focused on shim removals and CI hardening inventory but did not fully map migration surfaces to feature flags and ownership.
- **After:** Adds end-to-end migration mapping, rollback tiers, control points, and ownership escalation map.
- **Risk notes:** Inventory can become stale when new plugin IDs or flags are introduced without parallel doc update.
