# UX Reliability Audit — 2026-05-17

- Branch: `claude/add-ux-accessibility-audits-P1zOj`
- HEAD: `4bcd7f40cff7f54a2935041584ae2f84f6f4e3d8`
- Scope: client surfaces (`apps/blackout-client/`, `apps/blackout-server/`
  web shell, `legacy/blackout-web/` parity reference, `blackout-mobile/`,
  `blackout-desktop/`) and the plugin surface
  (`apps/blackout-client/src/app/features/plugins/`).
- Methodology: structured checklist run feature-by-feature and
  plugin-by-plugin before release. Designed to catch the defect class
  that prose usability reviews miss — *behavior under complexity* rather
  than first-impression design.
- Related: [`accessibility-audit-2026-05-17.md`](./accessibility-audit-2026-05-17.md),
  [`../usability-improvements.md`](../usability-improvements.md) (live P0/P1
  defect tracker), [`../archive/component-roadmap-v1.md`](../archive/component-roadmap-v1.md)
  (component-level a11y requirements).

## Purpose & scope

This is a **reliability rubric**, not a heuristic evaluation. Nielsen
heuristics and per-feature usability tests still apply; this rubric
asks a narrower question:

> *Across every realistic combination of open panels, network states,
> viewports and input modalities, can the user always close, cancel,
> back out, return home, or recover?*

It exists because the defects users hit on Blackout are not aesthetic —
they are **escape failures, navigation traps, plugin invisibility,
overlay/contrast breakdown, and combinatorial UI breakage**. These are
catchable with a checklist; without one, they slip past PR review.

Apply this audit:

- to every PR that introduces a new modal, drawer, popover, route, or
  plugin surface;
- to every plugin in `apps/blackout-client/src/app/features/plugins/`
  before it is enabled by default;
- as a release-gate pass before each tagged build.

## Top-level rule: "No Dead Ends"

From any user state, the user must reach **at least one of** close,
cancel, back, home, or recover **within two interactions**. A state that
fails this rule blocks merge.

This single rule subsumes most of what follows. The sub-audits below
make it concrete.

## Sub-audits

### A. Recovery audit

> Can the user undo what just happened?

| Check | Required |
| --- | --- |
| Open popovers/modals can be closed via at least one user-visible affordance | Yes |
| Destructive actions (delete room, kick, leave space) have an undo OR a confirm | Yes |
| Long-running actions (upload, encode, federation join) can be cancelled | Yes |
| Network reconnect restores prior view + composer draft + scroll position | Yes |
| Form input is preserved across viewport resize and tab change | Yes |
| Failed actions surface an actionable error (not a silent toast) | Yes |

Evidence anchors (HEAD `4bcd7f4`):

- `apps/blackout-client/src/app/components/Modal500.tsx` — generic
  error-recovery modal.
- `legacy/blackout-web/src/app.ts:315` — document-level `pointerdown`
  listener and `closeComposerPanels()` (parity reference; the equivalent
  pattern must exist in `apps/blackout-client/`).

### B. Persistent navigation audit

> Can the user always get home?

| Check | Required |
| --- | --- |
| A "home" / root anchor is reachable from every screen in ≤ 1 click | Yes |
| Browser/system back behaves predictably (no swallowed history entries) | Yes |
| Mobile tab bar / nav drawer is not occluded by open panels | Yes |
| Deep links restore the navigation chrome, not just the leaf view | Yes |
| Plugin views inherit (not replace) the host nav shell | Yes |
| No screen lacks both a back affordance and a home affordance | Yes |

Evidence anchors:

- `apps/blackout-client/src/app/components/nav/` — `NavCategory.tsx`,
  `NavItem.tsx`, `NavCategoryHeader.tsx`, `NavEmptyLayout.tsx`.
- `legacy/blackout-web/src/components/MobileTabBar.ts` — bottom tab
  bar (parity reference).
- `apps/blackout-client/src/app/hooks/useRoomNavigate.ts`,
  `useNavToActivePathMapper.ts`.

### C. Modal & overlay audit

> Can the user always close what is on top?

| Check | Required |
| --- | --- |
| Visible close (×) control inside the overlay's viewport | Yes |
| `ESC` closes the topmost overlay | Yes |
| Click-outside (pointerdown outside) closes, unless a confirm is pending | Yes |
| On mobile, swipe-down / back-gesture dismisses bottom sheets | Preferred |
| Focus is trapped inside the overlay while open | Yes |
| Focus returns to the trigger element on close | Yes |
| Stacked overlays render in z-index order, with the topmost interactive | Yes |
| Backdrop opacity / blur passes the contrast check in [`accessibility-audit-2026-05-17.md`](./accessibility-audit-2026-05-17.md) | Yes |

Evidence anchors:

- `apps/blackout-client/src/app/components/UIAFlowOverlay.tsx`,
  `Modal500.tsx`, `LogoutDialog.tsx`.
- `apps/blackout-client/src/app/features/create-room/CreateRoomModal.tsx`,
  `features/steganography/HideMessageDialog.tsx`,
  `features/profile/ProfileModal.tsx`,
  `features/forum/CreatePostModal.tsx`,
  `features/monetization/marketplace/EmbeddedCheckoutOverlay.tsx`,
  `features/moderation/TimeoutDialog.tsx`,
  `components/product-attachment/AttachProductDialog.tsx`.
- `apps/blackout-client/src/app/styles/Modal.css.ts` — shared
  modal/backdrop tokens; opacity changes must be reviewed here.
- Shipped click-outside reference:
  `legacy/blackout-web/src/app.ts:315` + `closeComposerPanels()`
  (also tracked as item #2 — Closed — in
  [`../usability-improvements.md`](../usability-improvements.md)).
- Focus-return on close (row 6) is delegated to
  `focus-trap-react`'s default `returnFocusOnDeactivate: true`. The
  six self-contained dialogs (`ProfileModal`, `CreatePostModal`,
  `HideMessageDialog`, `AttachProductDialog`,
  `EmbeddedCheckoutOverlay`, `TimeoutDialog`) wrap their `role="dialog"`
  root in `<FocusTrap>`; `Reactions.tsx` / `Message.tsx` no longer
  override the default to `false`. JSDOM tests pin the behaviour via
  `tests/unit/features/steganography/HideMessageDialog.test.tsx`
  ("returns focus to the trigger element after close").

### D. Plugin integration audit

> Does the plugin become a visible, recoverable object in the UI?

| Check | Required |
| --- | --- |
| After install, the plugin appears in a discoverable surface (sidebar, home, plugin tray) without a reload | Yes |
| Enabled / disabled / error state is visible at a glance | Yes |
| Plugins may register a homepage card or pinned nav entry (capability exists, not optional) | Yes |
| Permission scopes shown in plain language before activation | Yes |
| Uninstall removes the plugin from every surface in one action | Yes |
| A crashing plugin is isolated and does not blank the host shell | Yes |
| Plugin state (open panel, in-progress form) persists across host re-render | Yes |

Evidence anchors:

- `apps/blackout-client/src/app/features/plugins/PluginsView.tsx`,
  `manifest.ts`, `nav.ts`, `panels.ts`, `routes.ts`.
- Host plugin runtime under `apps/blackout-client/src/app/plugins/`
  (composer, navigation, right-panel, shell, custom-emoji, theme,
  matrix-adapters).
- Discoverable-surface protocol (row 3): `PluginManifest` carries
  optional `homepageCard` and `pinnedNav` fields
  (`packages/blackout-protocol/src/plugins/index.ts`). Installed
  records with `pinnedNav` flow through
  `apps/blackout-client/src/app/features/monetization/install/installedPluginPanelsAtom.ts`
  into `RegistrySidebarList` as `kind: 'sidebar'` panels. PluginsView
  surfaces the declared surfaces per install via a "Surfaces:" line
  (`plugin-surfaces-<id>` testid). `homepageCard` rendering is
  deferred until a home/landing surface lands;
  `right-panel`/`mobile-tab` plugin contributions are a future
  protocol slice.

### E. Visual hierarchy audit

> Can the user see what to do next?

| Check | Required |
| --- | --- |
| Primary action is the most visually prominent control on the surface | Yes |
| Backdrops/overlays never reduce foreground text contrast below the thresholds in `accessibility-audit-2026-05-17.md` | Yes |
| Translucent surfaces are bounded — no stacked translucencies | Yes |
| Spacing follows the design tokens in `design-tokens.example.json` | Yes |
| Icon-only buttons have an accessible label and a hover/focus tooltip | Yes |
| Loading, empty and error states are distinct and labelled | Yes |

## State-explosion test matrix

Most chat-app UI defects are combinatorial. Before release, smoke-test
the cells marked ●. Cells marked ○ are best-effort.

| Concurrent state | Modal | Drawer | Soft keyboard | Voice/call | Notification | Reconnect | Rotation |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Modal open      | —  | ●  | ●  | ●  | ●  | ●  | ●  |
| Drawer open     | ●  | —  | ●  | ●  | ○  | ●  | ●  |
| Soft keyboard   | ●  | ●  | —  | ○  | ○  | ○  | ●  |
| Voice/call      | ●  | ●  | ○  | —  | ●  | ●  | ●  |
| Notification    | ●  | ○  | ○  | ●  | —  | ○  | ○  |
| Reconnect       | ●  | ●  | ○  | ●  | ○  | —  | ●  |
| Rotation        | ●  | ●  | ●  | ●  | ○  | ●  | —  |

The minimum smoke pass is the modal row and the reconnect row — those
are where Blackout has historically broken.

## Bug severity taxonomy

Use these as GitHub labels (`ux-critical`, `ux-major`, `ux-minor`,
`discoverability`, `accessibility`, `navigation`). Triage references
the rubric in this document, not the reporter's wording.

| Label | Definition | Example |
| --- | --- | --- |
| `ux-critical`     | User cannot complete or escape a core flow | Cannot close stego composer popover |
| `ux-major`        | User completes the flow but with confusion or repeated retries | Home anchor hidden behind drawer on mobile |
| `ux-minor`        | Cosmetic / readability friction that does not block the task | Overlay backdrop slightly too translucent |
| `discoverability` | Capability exists but users do not find it | Installed plugin not present on home |
| `accessibility`   | Fails a check in `accessibility-audit-2026-05-17.md` | Modal opacity drops text contrast below 4.5:1 |
| `navigation`      | User is trapped or back/forward is broken | Plugin view replaces nav chrome |

## How to run this audit

1. **Per feature PR.** Author runs the relevant sub-audits (A–E) against
   the new surface and pastes the filled checklist into the PR
   description. Reviewer rejects the PR if any "Yes" row is unchecked
   without justification.
2. **Per plugin.** Sub-audit D is mandatory before a plugin is enabled
   by default in `apps/blackout-client/src/app/features/plugins/manifest.ts`.
3. **Per release.** A release captain runs the state-explosion matrix
   on a real device matrix (desktop Tauri, Capacitor iOS, Capacitor
   Android) as part of staging signoff. The result is filed in
   `docs/operations/evidence/`.
4. **Tooling.**
   - axe DevTools and Lighthouse for the a11y rows
     (see `accessibility-audit-2026-05-17.md`).
   - Playwright for the navigation rows
     (`playwright.config.ts`, `apps/blackout-client/tests/e2e/`).
   - `eslint-plugin-jsx-a11y` (via
     `plugin:matrix-org/a11y` in `.eslintrc.cjs`) for static checks.
     The currently-disabled rules listed there are technical debt for
     this audit to retire over time.

## A "UX QA" role

Separate from developers, bug hunters and security testers, Blackout
should have community members whose only job is to report
friction / confusion / discoverability / readability defects against
this rubric. The bug-severity taxonomy above is calibrated for their
output to be triageable on arrival.

## Cross-references

- [`accessibility-audit-2026-05-17.md`](./accessibility-audit-2026-05-17.md)
  — WCAG 2.2 AA checklist; the source of contrast/keyboard rules cited
  above.
- [`../usability-improvements.md`](../usability-improvements.md) — live
  P0/P1 defect tracker. Items #1, #2, #6, #7 each map onto rows in
  sub-audits A, C and B.
- [`../features/stoat_inspired_community_ux_plan.md`](../features/stoat_inspired_community_ux_plan.md)
  — navigation shell design and keyboard continuity.
- [`../archive/component-roadmap-v1.md`](../archive/component-roadmap-v1.md) —
  Button/Form-level a11y requirements (focus rings, ARIA, keyboard).
