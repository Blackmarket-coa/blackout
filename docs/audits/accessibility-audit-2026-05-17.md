# Accessibility Audit — 2026-05-17

- Branch: `claude/add-ux-accessibility-audits-P1zOj`
- HEAD: `4bcd7f40cff7f54a2935041584ae2f84f6f4e3d8`
- Standard: **WCAG 2.2 AA** (target). EN 301 549 alignment follows from
  AA conformance.
- Scope: `apps/blackout-client/` (web shell + features),
  `blackout-mobile/`, `blackout-desktop/`, and any plugin surface that
  ships UI under `apps/blackout-client/src/app/features/plugins/` or
  `apps/blackout-client/src/app/plugins/`.
- Companion document:
  [`ux-reliability-audit-2026-05-17.md`](./ux-reliability-audit-2026-05-17.md)
  — references this audit for its contrast and keyboard rows.

## Why this exists

Blackout ships visual designs with heavy use of overlays, translucent
backdrops and AMOLED dark themes. The dominant accessibility failure
mode is **readability collapse under stacked translucency**, followed by
focus-management bugs in modals. The checklist below is the rubric;
treat any "Required" row that fails as a release blocker.

`.eslintrc.cjs` extends `plugin:matrix-org/a11y` but disables a list of
`jsx-a11y/*` rules with the comment *"There are too many a11y
violations to fix at once"*. Each disabled rule is technical debt that
this audit is responsible for retiring.

## 1. Keyboard

| Check | Required |
| --- | --- |
| Every interactive element reachable via `Tab` in a logical order | Yes |
| Visible focus ring on every focusable element, meets 3:1 contrast against the adjacent background | Yes |
| `Enter` / `Space` activate the focused control; `Esc` dismisses overlays | Yes |
| Arrow-key navigation inside composite widgets (menus, listboxes, tab lists) follows the WAI-ARIA Authoring Practices | Yes |
| No keyboard trap outside of an intentional modal focus trap | Yes |
| Focus returns to the trigger element when an overlay closes | Yes |

Anchors: `apps/blackout-client/src/app/styles/Modal.css.ts`,
`apps/blackout-client/src/app/components/nav/NavItem.tsx`,
`packages/design/src/` (tokens),
[`../archive/component-roadmap-v1.md`](../archive/component-roadmap-v1.md) (focus
ring spec on Button/Form).

## 2. Screen readers & semantics

| Check | Required |
| --- | --- |
| Icon-only buttons have an `aria-label` (and a visible tooltip on hover/focus) | Yes |
| Modals render with `role="dialog"` (or `alertdialog` for blocking errors) and an `aria-labelledby` pointing at the title | Yes |
| Live regions (`aria-live="polite"`) used for non-blocking status: toasts, reconnect banners, encode progress | Yes |
| Form fields have associated `<label>` (not placeholder-as-label) and `aria-describedby` for help/error text | Yes |
| Decorative SVGs marked `aria-hidden="true"`; meaningful SVGs given `role="img"` and a `<title>` | Yes |
| Landmark roles present: a single `main`, one `nav` per nav region, `header`/`footer` where appropriate | Yes |

Anchors: `apps/blackout-client/src/app/components/UIAFlowOverlay.tsx`,
`Modal500.tsx`, `LogoutDialog.tsx`,
`features/create-room/CreateRoomModal.tsx`,
`features/steganography/HideMessageDialog.tsx`,
`features/profile/ProfileModal.tsx`,
`features/forum/CreatePostModal.tsx`,
`features/moderation/TimeoutDialog.tsx`,
`features/monetization/marketplace/EmbeddedCheckoutOverlay.tsx`,
`components/product-attachment/AttachProductDialog.tsx`.

## 3. Color & contrast

WCAG 2.2 minimums, enforced for every theme (light, dark, AMOLED):

| Surface | Minimum contrast ratio |
| --- | --- |
| Body text against its background | 4.5:1 |
| Large text (≥ 18.66px bold or ≥ 24px) | 3:1 |
| Non-text UI (icons, borders, focus rings, form outlines) | 3:1 |
| Text **layered over a translucent backdrop or overlay** | 4.5:1 measured against the *effective* composited background, not the token color |

### The overlay-opacity rule

> Translucent backdrops must not drop the contrast of any foreground
> text below 4.5:1 measured against the *effective* (composited)
> background.

In practice:

- A modal backdrop alpha below `0.75` over the AMOLED theme will almost
  always fail. Either deepen the backdrop, render the modal on an
  opaque card, or both.
- Stacked translucencies (modal over toast over drawer) are forbidden;
  pick one translucent layer per stack and make the rest opaque.
- Backdrop `backdrop-filter: blur(...)` is allowed only if the blurred
  result still passes the contrast check on at least three reference
  backgrounds (dark theme, light theme, busy media surface).

Anchors: `apps/blackout-client/src/app/styles/Modal.css.ts`,
`apps/blackout-client/src/app/colors.css.ts`,
`design-tokens.example.json`.

## 4. Motion, animation, reduced motion

| Check | Required |
| --- | --- |
| `prefers-reduced-motion: reduce` honored: non-essential animations disabled or shortened to ≤ 100 ms | Yes |
| No flashing content above 3 Hz (WCAG 2.3.1) | Yes |
| Parallax / large camera moves opt-in only | Preferred |

## 5. Touch & pointer targets

| Check | Required |
| --- | --- |
| Touch targets ≥ 24 × 24 CSS px (WCAG 2.5.8); 44 × 44 strongly preferred on mobile | Yes |
| Adjacent targets do not overlap; minimum 8 px gap between hit areas | Yes |
| Drag-only interactions have a keyboard / button alternative | Yes |

## 6. Zoom & reflow

| Check | Required |
| --- | --- |
| UI reflows at 320 CSS px wide without horizontal scrolling (WCAG 1.4.10) | Yes |
| Text scales to 200 % without loss of content or function | Yes |
| Composer, modal and nav remain usable at 200 % zoom on the smallest supported viewport | Yes |

## 7. Plugin & extension surfaces

Plugins inherit the host's a11y obligations:

| Check | Required |
| --- | --- |
| Plugin-registered UI passes sections 1–6 above before it can be enabled by default in `manifest.ts` | Yes |
| Plugin nav entries (`features/plugins/nav.ts`) expose accessible names | Yes |
| Plugin panels (`features/plugins/panels.ts`) render with the host modal/drawer primitives, not bespoke overlays | Preferred |

## Tooling

| Layer | Tool |
| --- | --- |
| Static lint | `eslint-plugin-jsx-a11y` via `plugin:matrix-org/a11y` (`.eslintrc.cjs`) — retire one disabled rule per release |
| Runtime audit (dev) | axe DevTools browser extension; Lighthouse "Accessibility" category in CI builds |
| E2E assertions | Playwright (`playwright.config.ts`, `apps/blackout-client/tests/e2e/`) — add `axe-playwright` if not yet present |
| Manual SR pass | VoiceOver (macOS / iOS), NVDA (Windows), TalkBack (Android) — one pass per release captain on every flow in the state-explosion matrix |

## How to run this audit

1. **Per PR.** Author runs section 1, 2, 3 against any new component and
   pastes the result into the PR. Reviewer blocks merge on any
   "Required: Yes" row that fails without an explicit waiver.
2. **Per release.** Release captain runs the full checklist on each
   shipping theme (light, dark, AMOLED) on a real device matrix, files
   the result in `docs/operations/evidence/`, and resolves any
   contrast-rule violations before signoff.
3. **Ongoing.** Each release removes at least one rule from the
   `jsx-a11y/* "off"` block in `.eslintrc.cjs`.

## Cross-references

- [`ux-reliability-audit-2026-05-17.md`](./ux-reliability-audit-2026-05-17.md)
- [`../usability-improvements.md`](../usability-improvements.md)
- [`../archive/component-roadmap-v1.md`](../archive/component-roadmap-v1.md)
