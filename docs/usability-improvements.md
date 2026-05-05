# Usability Feedback — Improvement Tracker

> Source: hands-on usability testing session (April 2026)
> Status: **Active** — prioritized and ready for implementation
> Active execution plan: `docs/active-workstreams-2026-04-05.md` (created 2026-04-05) for slice-by-slice delivery and verification.
>
> Note (2026-05): The orphan repo-level regression tests under `test/mobile-regression/` were removed in the dead-code purge. The `apps/blackout-web/...` evidence anchors below describe the pre-archive surface; those files now live in `legacy/blackout-web/...` (parity reference) until canonical equivalents in `apps/blackout-client/` take over.

---

## P0 — Show-stoppers

### 1. Android keyboard dismissal bug

**Problem:** On Android, the soft keyboard frequently dismisses itself while typing in the message composer. Users cannot reliably compose messages on mobile.

**Root cause:** The Capacitor WebView loses input focus when the soft keyboard triggers a viewport resize event. The current config (`blackout-mobile/capacitor.config.ts`) sets `Keyboard.resize: 'body'` and `resizeOnFullScreen: true`, but lacks scroll-assist options that prevent the WebView from reflowing the input out of focus during resize.

**Proposed fix:**
1. Update `blackout-mobile/capacitor.config.ts` — add `style: 'DARK'`, `scroll: true`, and `scrollAssist: true` to the Keyboard plugin config.
2. Verify that the auto-generated `AndroidManifest.xml` sets `android:windowSoftInputMode="adjustResize"`. If not, override via Capacitor's `android` config block or a custom manifest merge.
3. Audit `apps/blackout-web/src/components/MessageInput.ts` for any `blur()` calls triggered on resize or scroll events.

**Acceptance criteria:**
- [x] User can type a full message on Android without keyboard dismissing
- [x] Keyboard persists through viewport resize events
- [x] Input retains focus when switching between stego/governance panels

Evidence: `blackout-mobile/capacitor.config.ts`, `blackout-mobile/android/app/src/main/AndroidManifest.xml`, `test/mobile-regression/composer-and-keyboard-guards.test.mjs`.

**Effort:** Small (hours)

---

### 2. Un-dismissable menus / panels

**Problem:** Composer popover panels (attachments, governance, GIF, emoji, stego) cannot be closed by tapping outside them. Users must tap a different trigger button or navigate away. Tab bar menus on mobile also lack dismiss behavior.

**Root cause:** `apps/blackout-web/src/app.ts:2415-2436` implements `toggleComposerPanel()` and `closeComposerPanels()` with mutual exclusivity (opening one closes others), but there is **no document-level click-outside listener** to close panels when the user taps elsewhere.

**Proposed fix:**
Add a `pointerdown` event listener on the document root that:
1. Checks if any `.composer-popover.is-open` panel exists
2. Checks if the event target is inside a `.composer-popover` or a composer trigger button
3. If neither, calls `closeComposerPanels()`

```typescript
// In app initialization / event binding
document.addEventListener("pointerdown", (event) => {
  const target = event.target as HTMLElement;
  if (!target) return;
  const insidePanel = target.closest(".composer-popover");
  const isTrigger = target.closest("[data-action^='composer-toggle-'], [data-action='composer-open-governance']");
  if (!insidePanel && !isTrigger) {
    this.closeComposerPanels();
  }
});
```

**Acceptance criteria:**
- [x] Tapping outside any open composer panel closes it
- [x] Tapping inside an open panel does NOT close it
- [x] Tapping a different trigger button still switches panels correctly
- [x] Escape key also closes open panels (stretch)

Evidence: `apps/blackout-web/src/app.ts`, `test/mobile-regression/composer-and-keyboard-guards.test.mjs`.

**Effort:** Small (hours)

---

## P1 — Accessibility & Onboarding

### 3. Jargon barrier — missing tooltip / glossary system

**Problem:** Technical terms appear throughout the UI without explanation. Terms like "E2EE," "Stego Tier," "Federation," "Reputation Tier," "Quorum," "LSB," "DCT," "TTL," "Ephemeral," and "Codec" are meaningless to new users. The tester described the experience as "powerful but cryptic."

**Root cause:** No tooltip or info-icon infrastructure exists in the codebase. The design package (`packages/design/`) and UI package (`packages/ui/`) are stubs.

**Proposed fix:**
1. Create a utility function `renderInfoTip(term: string, definition: string): string` that returns an inline `<span class="info-tip">` with an `ⓘ` icon. On hover (desktop) or tap (mobile), show a popover with the plain-language definition.
2. Define a glossary map of terms and definitions.
3. Apply `renderInfoTip()` to labels in `MessageInput.ts` (stego panel), `GovernanceRoomPanel.ts`, `FederationPanel.ts`, and onboarding UI.

**Glossary (initial set):**

| Term | Plain-language definition |
|------|--------------------------|
| E2EE | End-to-end encryption — only you and the recipient can read messages |
| Steganography | Hiding a secret message inside normal-looking text or images |
| Stego Tier | The level of steganographic encoding applied to a message |
| LSB (Image) | Least Significant Bit — hides data in the smallest details of an image |
| DCT (Image) | Discrete Cosine Transform — hides data in image frequency patterns |
| Federation | Connecting multiple independent servers so they can communicate |
| Quorum | The minimum number of votes needed for a decision to count |
| Reputation Tier | Your trust level in the community (member → vendor → coordinator → arbiter) |
| TTL | Time To Live — how long an ephemeral message exists before auto-deleting |
| Ephemeral | A message that automatically disappears after a set time |
| Codec | The encoding method used to hide or reveal a steganographic message |
| Cover text | The normal-looking text that carries a hidden message inside it |

**Acceptance criteria:**
- [x] Every jargon term in the stego panel has an info tooltip
- [x] Tooltips are readable on both desktop and mobile (tap-to-show on mobile)
- [x] Glossary is centralized in one file for easy maintenance

Evidence: `apps/blackout-web/src/components/glossary.ts`, `apps/blackout-web/src/components/MessageInput.ts`, `apps/blackout-web/src/components/GovernanceRoomPanel.ts`, `apps/blackout-web/src/components/FederationPanel.ts`, `test/mobile-regression/onboarding-and-stego-ux-guards.test.mjs`.

**Effort:** Medium (a few days, then ongoing)

---

### 4. Onboarding expansion — guided tours for advanced features

**Problem:** Current onboarding covers 4 basic steps (join workspace, create room, invite, start thread/call — see `app.ts:307-317`). Users encounter the stego composer, governance tools, and federation features without any guidance on what they do or why they matter.

**Root cause:** Onboarding was built for the basic chat flow. Advanced modules (stego, governance, federation) have no discovery or tutorial path. The `trackAdvancedDiscovery()` method (`app.ts:354`) fires telemetry but provides no user-facing guidance.

**Proposed fix:**
1. Add 3 optional onboarding steps (5-7) for advanced feature discovery:
   - Step 5: "Try hiding a message" — guided stego encode
   - Step 6: "Create a proposal" — guided governance vote
   - Step 7: "Explore federation" — guided federation panel
2. On first open of the stego panel, show a 3-step tooltip walkthrough:
   - "This tool lets you hide secret messages inside normal-looking text."
   - "Enter a hidden message, some cover text, and a passphrase."
   - "The output looks like regular text — only someone with the passphrase can decode it."
3. Same pattern for governance: "This is how your community makes decisions together."

**Acceptance criteria:**
- [x] First-time stego panel open shows guided walkthrough
- [x] First-time governance panel open shows guided walkthrough
- [x] Users can skip/dismiss tours permanently
- [x] Tour completion triggers telemetry events

Evidence: `apps/blackout-web/src/app.ts` (`maybeShowAdvancedTour`, `advanceAdvancedTour`, `skipAdvancedTour`, `trackAdvancedDiscovery`), `test/mobile-regression/onboarding-and-stego-ux-guards.test.mjs`.

**Effort:** Medium (3-5 days)

---

### 5. Stego composer UX — explanatory interface

**Problem:** The stego panel (`MessageInput.ts:174-260`) presents 3 tabs (Hide/Decrypt/Password) with dense forms and no explanation of what the output will look like. The tester was confused that the encoder outputs "readable text strings" — not understanding that zero-width characters are embedded invisibly.

**Root cause:** No explanatory text, no preview, no progressive disclosure. Advanced options (codec selection, ephemeral toggle, TTL, channel selection) are shown upfront alongside basic fields.

**Proposed fix:**
1. Add a brief description under the "Stego composer" title:
   > "Hide secret messages inside normal-looking text. Only someone with your passphrase can read them."
2. Add a before/after preview below the encode form:
   - "Others see: `let's sync after standup`"
   - "Hidden inside: `hidden-message`"
   - Optional: "Reveal" toggle that highlights zero-width character positions
3. Implement progressive disclosure: show only hidden text, cover text, and passphrase by default. Place codec, channel, ephemeral, and TTL behind an "Advanced options" toggle.
4. Add inline validation feedback (e.g., passphrase strength indicator).

**Acceptance criteria:**
- [x] Stego panel header explains what steganography does in one sentence
- [x] Encode view shows before/after preview of output
- [x] Advanced options hidden by default behind toggle
- [x] Basic encode workflow requires only 3 fields

Evidence: `apps/blackout-web/src/components/MessageInput.ts`, `apps/blackout-web/tests/unit/message-input-stego.test.ts`, `test/mobile-regression/onboarding-and-stego-ux-guards.test.mjs`.

**Effort:** Medium (2-3 days)

---

## P2 — Quality of Life

### 6. Bug report widget

**Problem:** No in-app mechanism for users to report bugs or give feedback. The tester had to provide feedback verbally/externally.

**Root cause:** No feedback UI component exists. The telemetry service (`services/telemetry.ts`) dispatches `CustomEvent` objects but has no user-facing submission interface.

**Proposed fix:**
1. Create `apps/blackout-web/src/components/BugReportFab.ts` — a floating action button (bottom-right, `🐛` icon) that opens a modal.
2. Modal contains 3 fields:
   - "Describe the issue" (textarea, required)
   - "Steps to reproduce" (textarea, optional)
   - "Suggestions" (textarea, optional)
3. On submit, dispatch a `blackout:telemetry` event with type `user_bug_report` and auto-collected metadata:
   - Device type, screen dimensions, user agent
   - Current view/route
   - Timestamp
   - App version
4. Optionally also POST to a webhook endpoint or send to a dedicated Matrix room.
5. Show confirmation toast on submit, then close modal.

**Acceptance criteria:**
- [x] FAB visible on all screens (but not blocking critical UI)
- [x] Modal opens on tap, submits on send, closes afterward
- [x] Auto-metadata attached to every submission
- [x] No auth required to submit
- [x] Works on both desktop and mobile

Evidence: `apps/blackout-web/src/components/BugReportFab.ts`, `apps/blackout-web/src/app.ts` (`submitBugReport` + bug report event bindings), `test/mobile-regression/bug-report-and-mobile-layout-guards.test.mjs`.

**Effort:** Small-Medium (1-2 days)

---

## P3 — Mobile Layout

### 7. Mobile layout overhaul — information density and navigation

**Problem:** The desktop layout "feels more like a terminal" and makes intuitive sense to power users, but the mobile layout has issues: tab menus drop down and obscure the screen, the sidebar takes too much space, and panels float awkwardly over content.

**Root cause:** The web UI was designed desktop-first. `MobileTabBar.ts` provides bottom navigation but panel presentation (dropdown popovers) doesn't adapt to mobile viewport constraints.

**Proposed fix:**
1. On mobile viewports (`< 768px`), render composer panels as full-screen bottom sheets with a drag handle and explicit close button, instead of floating dropdown popovers.
2. Collapse the channel sidebar into a hamburger menu overlay.
3. Make the message composer take up most of the screen real estate — send button prominently placed.
4. Tab bar actions should open full-screen overlays, not floating dropdown menus.
5. Add CSS breakpoint system (currently none exists).

**Acceptance criteria:**
- [x] Composer panels render as bottom sheets on mobile
- [x] Sidebar collapses to hamburger on mobile
- [x] No floating panels obscure content on mobile
- [x] Desktop layout unchanged

Evidence: `apps/blackout-web/src/styles.css` (mobile breakpoints for `.composer-popover.is-open`, `.server-sidebar`, `.mobile-toggle`), `apps/blackout-web/src/app.ts` (drawer toggle wiring), `test/mobile-regression/bug-report-and-mobile-layout-guards.test.mjs`.

**Effort:** Large (1-2 weeks)

---

## Implementation Order

| Priority | Item | Effort | Dependencies |
|----------|------|--------|-------------|
| 1 | Fix Android keyboard bug (#1) | Hours | None |
| 2 | Fix menu dismissal (#2) | Hours | None |
| 3 | Add bug report widget (#6) | 1-2 days | None |
| 4 | Add info tooltips to jargon (#3) | Few days | Glossary definition |
| 5 | Improve stego composer UX (#5) | 2-3 days | Tooltip system (#3) |
| 6 | Expand onboarding tour (#4) | 3-5 days | Stego UX (#5) |
| 7 | Mobile layout overhaul (#7) | 1-2 weeks | All above inform design |

---

## Quick Wins Applied in This Commit

- **Click-outside-to-close handler** added to `app.ts` (fixes #2)
- **Capacitor keyboard config** improved in `capacitor.config.ts` (mitigates #1)
