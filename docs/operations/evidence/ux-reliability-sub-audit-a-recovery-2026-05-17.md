# UX Reliability — Sub-audit A (Recovery) — 2026-05-17

- Branch: `claude/plugin-manifest-fields-e3XO2`
- Base HEAD: `ee801d245c2fae8d7cb8991325ad767efe10894b`
- Rubric source: [`docs/audits/ux-reliability-audit-2026-05-17.md`](../../audits/ux-reliability-audit-2026-05-17.md) §A
- Scope: the diff on this branch — `PluginManifest` protocol fields,
  pinned-nav / homepage-card wiring, the new `PluginRouteBoundary`
  fallback, and the modal focus-return sweep. Surfaces outside the
  diff are deferred to per-feature audit runs.

| # | Check | Required | Result | Evidence | Notes |
| --- | --- | --- | --- | --- | --- |
| A1 | Open popovers/modals can be closed via at least one user-visible affordance | Yes | Yes | `apps/blackout-client/src/app/features/plugins/PluginsView.tsx:334` Cancel button + click-outside on the role=alertdialog overlay (`apps/blackout-client/src/app/features/plugins/PluginsView.tsx:291,304`). `FocusTrap` call sites set `onDeactivate` for ESC/click-outside (`apps/blackout-client/src/app/components/Modal500.tsx:19`, `apps/blackout-client/src/app/components/UIAFlowOverlay.tsx:37`, `apps/blackout-client/src/app/features/create-room/CreateRoomModal.tsx:48`). | No regressions introduced by this diff. |
| A2 | Destructive actions have undo OR confirm | Yes | Yes | Disabling a runtime shell plugin is the only destructive action touched by this diff; it is gated by the confirm overlay (`apps/blackout-client/src/app/features/plugins/PluginsView.tsx:99,291`). Uninstall flows under `pluginInstaller.ts:uninstallPlugin` are non-UI here. | Plugin install path is additive — no confirm required. |
| A3 | Long-running actions can be cancelled | Yes | N/A | No long-running action introduced by this diff. `installEntitlement` is awaited from the marketplace flow and isn't exposed as a foreground spinner by this PR. | Defer to the marketplace audit. |
| A4 | Network reconnect restores prior view + composer draft + scroll position | Yes | N/A | Diff does not touch composer, scroll, or reconnect paths. | — |
| A5 | Form input is preserved across viewport resize and tab change | Yes | N/A | Diff does not touch form components. | — |
| A6 | Failed actions surface an actionable error (not a silent toast) | Yes | Yes | `PluginRouteBoundary` (`apps/blackout-client/src/app/core/features/PluginRouteBoundary.tsx:24-45`) renders an in-place fallback with the failing plugin id, the error message, and a recovery hint ("disable from the Plugins page"). Verified by `tests/unit/plugins/spatialRepresentation.test.tsx` (`PluginRouteBoundary > renders the fallback when its child throws`). Install failures continue to be surfaced via the existing `InstalledPluginRecord.lastError` path (`apps/blackout-client/src/app/features/plugins/PluginsView.tsx:260`). | The fallback intentionally exposes `error.message` rather than a generic toast. |

## Crash-isolation evidence

Sub-audit D's "A crashing plugin is isolated and does not blank the
host shell" overlaps with A6. Containment is verified by
`tests/unit/plugins/spatialRepresentation.test.tsx` which mounts a
throwing component inside `PluginRouteBoundary` and asserts the
fallback element (`data-testid="plugin-route-error"`) is rendered with
the `data-plugin-id` attribute set to the failing plugin. The
surrounding `AppShell` chrome (top bar, bottom tab bar, primary rail)
is mounted by `apps/blackout-client/src/app/pages/shell/AppShell.tsx`
which sits *above* the wrapped `<Outlet />` route element, so a
boundary catch leaves all chrome intact.

## Focus-return sweep

Sub-audit C's "Focus returns to the trigger element on close" was the
recovery-adjacent concern called out in the task brief. Changes:

- `Modal500.tsx`, `UIAFlowOverlay.tsx`, `CreateRoomModal.tsx` now set
  `returnFocusOnDeactivate: true` explicitly on their FocusTrap
  options.
- `PluginsView.tsx` adds a `useRef`/`useEffect` pair that captures
  `document.activeElement` when the hand-rolled `pendingToggle`
  alertdialog opens and restores it on close.

Other dialogs that bypass FocusTrap (`LogoutDialog`,
`HideMessageDialog`, `ProfileModal`, `CreatePostModal`,
`EmbeddedCheckoutOverlay`, `TimeoutDialog`, `AttachProductDialog`)
are tracked as a known gap; their migration is intentionally not in
scope for this PR per the resolved design choice
("Rely on focus-trap-react's `returnFocusOnDeactivate`") and is
deferred to a follow-up sweep.

## Result

Required rows in scope of this diff: **all met**. Out-of-scope rows
(A3, A4, A5) are deferred to their feature-owning audit runs.
