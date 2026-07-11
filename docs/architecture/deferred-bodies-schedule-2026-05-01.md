# Deferred Bodies — Sequenced Schedule (2026-05-01)

Companion to `docs/architecture/frontend-consolidation-migration-backlog.md`
and `docs/features/discord_parity_blueprint.md`. Captures the larger
deferred bodies surfaced in the 2026-04 / 2026-05 incomplete-todos sweep so
the next session can pick up cleanly without re-deriving sequencing.

Snapshot date: 2026-05-01
Canonical frontend: `apps/blackout-client` / `@blackout/client`
Companion governance shell: `apps/blackout-gov` / `@blackout/blackout-gov`

## Sizing legend

| Tag | Rough effort |
| --- | --- |
| XS  | < 0.5 day |
| S   | 0.5 – 1 day |
| M   | 1 – 3 days |
| L   | 3 – 8 days (multi-PR) |
| XL  | 2+ weeks (multi-week feature) |

Effort assumes one engineer with codebase context. Add 30–50% if context is
cold.

## Workstream sequencing (global)

```
                       (foundations already landed, see migration backlog)
                                          │
                                          ▼
              ┌──────────────────────────────────────────────────────┐
              │ Workstream A — Migration Ports 1-5 (rendering rewire) │
              └──────────────────────────────────────────────────────┘
                                          │
                              ┌───────────┴───────────┐
                              ▼                       ▼
        ┌──────────────────────────────┐    ┌──────────────────────────────┐
        │ Workstream B — UI Primitives │    │ Workstream C — Reactions /   │
        │ v1 (@blackout/ui foundation) │    │ Threading parity hardening   │
        └──────────────────────────────┘    └──────────────────────────────┘
                              │                       │
                              └───────────┬───────────┘
                                          ▼
              ┌──────────────────────────────────────────────────────┐
              │ Workstream D — Discord Parity Phase 2 (rich media)   │
              └──────────────────────────────────────────────────────┘
                                          │
                                          ▼
              ┌──────────────────────────────────────────────────────┐
              │ Workstream E — Discord Parity Phase 3 (community)    │
              └──────────────────────────────────────────────────────┘
                                          │
                                          ▼
              ┌──────────────────────────────────────────────────────┐
              │ Workstream F — Discord Parity Phase 4 (polish)       │
              └──────────────────────────────────────────────────────┘
```

Workstreams B and C can run in parallel with A; D depends on B+C; E builds
on D; F is the closing pass.

---

## Workstream A — Migration Ports 1–5 (BKL UI rewire pass)

The BKL-001 … BKL-013 foundations have all landed (protocol contracts, SDK
actions, registry manifests, tests). What remains is the canonical-shell
*surface adoption* — actually rendering the BKL renderers inside the
modern ClientLayout and Settings IA so end users see the migrated
capabilities.

### Port 1 — Mount BKL renderers in canonical ClientLayout

**Maps to:** BKL-001 (full ClientLayout adoption) + BKL-002 (RegistrySidebarList / RegistrySettingsList full mount).

**Prereqs:**
- `RegistrySidebarList` already mounted in `ClientLayout.tsx` (desktop spaces rail). Done 2026-04-30.
- `RegistrySettingsList` already mounted in `Settings.tsx` ("Feature settings" page). Done 2026-04-30.
- `capabilityContextAtom` + `RegistryFetcherProvider` wired in `main.tsx`. Done 2026-04-30.

**Scope:**
- Replace remaining static nav entries in `ClientLayout.tsx` (right panel, mobile rail, workspace tabs) with registry-driven `RegistryRouteList` / panel composers.
- Adopt `composeAdminEntries` from `Sidebar.tsx` so admin-entry annotations on `platform-ops` / future modules drive visibility instead of the legacy `showAdminEntry` boolean.
- Replace `LegacyClientLayout` (post-`bmc-*` shim) with the modern shell once registry-driven nav covers parity.

**Exit criteria:**
- Every BKL-002 admin entry hides/shows correctly under capability flips with no ad-hoc booleans left.
- Workspace tabs and mobile rail both consume the registry composer (BKL-001 panels).
- Router-integration test adds at minimum one assertion per shell panel state for `Home / Direct / Explore / Inbox`.

**Size:** L (4–6 days; lots of small surface-by-surface mechanical adoption with regression risk on a mostly-passing test suite).

### Port 2 — Render BKL-003 governance scheduler + treasury UI

**Scope:**
- Replace placeholder routes at `/governance/meetings` and `/governance/treasury` with working forms.
- Wire `governanceRightPanelTabs` (active|past|create|my-votes|results) into the canonical Cinny right-panel strip.
- Connect to the existing `createGovernanceActions(client)` SDK (`scheduleMeeting`, `listMeetings`, `cancelMeeting`, `getTreasurySnapshot`, `listTreasurySnapshots`).

**Exit criteria:**
- Scheduler form posts a `GovernanceMeetingPayload` and refreshes `listMeetings`.
- Treasury page renders the latest snapshot + paginated history; precision-safe string balances kept intact.
- Right-panel tab strip switches active state per route segment.
- Page tests in the same shape as the BKL-005 (`StegoToolkitPage.test.tsx`) and BKL-010 (`FederatedOpsPages.test.tsx`) finished pages.

**Size:** M (2–3 days).

### Port 3 — Render BKL-004 notifications + presence digest UI

**Scope:**
- Replace placeholder for the notification-rule editor (settings) and presence digest inbox (route + right-panel).
- Drive the rule editor through `createNotificationActions(client)` (`fetchNotificationRules`, `upsertNotificationRule`, `deleteNotificationRule`).
- Drive the digest through `fetchPresenceDigest` + `acknowledgePresenceDigest` and render the `PresenceDigestActivity` summary mirroring `apps/blackout-web/src/services/presence-digest.ts` semantics (already covered by `buildPresenceDigest` SDK helper).

**Exit criteria:**
- Editing a rule round-trips through the SDK and updates local state without page refresh.
- Digest page displays activities grouped by window (default + custom `windowMinutes`); ack moves digest to read state.
- Page tests cover empty state, error state, optimistic update.

**Size:** M (2–3 days).

### Port 4 — Render BKL-006 media + dialpad + Element Call UI

**Scope:**
- Replace placeholders for media-pipeline upload progress widget, dialpad entry form, and Element Call launcher.
- Wire the upload widget to `createMediaActions(client).fetchUploadProgress` / `cancelUpload` / `fetchCompletedUpload`.
- Dialpad form synthesizes `CallLaunchIntentPayload` via the existing `buildDialpadIntent` helper; submit posts via `createCallActions(client).dialpadCall`.
- Element Call launcher posts `launchCall(kind: 'element-call')` and surfaces unsupported-capability fallback.
- Compose with `nativeMediaBridge.nativePickPhoto` for in-composer attachments (closes the WRAP-004 trail per BKL-006 status note).

**Exit criteria:**
- Upload widget renders progress + cancel + completed states.
- Dialpad form validates E.164 input and clears formatting; intent payload matches contract.
- Element Call launcher launches via SDK + emits the protocol intent.
- Capability-disabled fallback renders for each surface.

**Size:** L (3–5 days; three distinct surfaces, native bridge integration).

### Port 5 — Settings IA rewire (BKL-007 + BKL-008 + BKL-009)

**Scope:**
- Move `PreferencesPage` / `SidebarPage` / `LabsPage` (BKL-007 finished pages) into the canonical settings IA so they're navigable from the sidebar (not just programmatic imports).
- Surface `StegoSettingsTab` (BKL-008 finished page) under the same IA.
- Surface `MjolnirSettingsPage` (BKL-009 finished page) under the moderation settings group.
- Validate the labs gate (`resolveLabsGate`) drives visibility instead of any leftover ad-hoc checks.

**Exit criteria:**
- Settings IA tree includes Preferences / Sidebar / Labs / Steganography / Mjolnir under the right groupings.
- Labs section visible only when `settings.labs.show` capability AND (`config_flag` OR `developer_mode`) gate resolves visible.
- Settings navigation test asserts every section is reachable from the Settings root.

**Size:** M (2–3 days; the pages exist, this is mostly IA wiring + tests).

### Workstream A total estimate
**L+M+M+L+M = ~13–20 days.** Sequencing: Port 1 first (foundation), then Ports 2–5 can run in parallel.

---

## Workstream B — UI Primitives v1 (`@blackout/ui` foundation)

`@blackout/ui` currently ships 4 boutique components (`CanopyBar`,
`OverflowSheet`, `RadialBloom`, `VineActions`). The canonical client and
governance shell are forced to inline ad-hoc styling for every primitive
(buttons, inputs, dialogs). UI primitives v1 establishes a typed React +
React-Native-compatible primitive set so future feature pages stop
re-inventing styling.

### Scope

- **Standard primitives:** `Button`, `IconButton`, `Input`, `TextArea`, `Select`, `Checkbox`, `Switch`, `Radio`, `Tabs`, `Tooltip`, `Popover`, `Modal` / `Dialog`, `Toast` / `Snackbar`, `Spinner`, `Avatar`, `Badge`, `Card`, `Separator`, `EmptyState`.
- **Layout primitives:** `Stack` (HStack / VStack), `Inline`, `Grid`, `Cluster`.
- **Composition primitives:** `Sheet` (mobile bottom-sheet generalization of `OverflowSheet`), `Menu` (keyboard-accessible).
- All primitives consume `@blackout/design` tokens (already hosts spacing, breakpoints, shell layout). Add color/typography token bundles in `@blackout/design` if not already.
- React Native build path: keep the existing RN-compatible posture (the package already ships `lucide-react-native`); validate each primitive's RN equivalent renders.
- Document a primitive index (`packages/ui/README.md`) mapping each primitive to its design-token usage.

### Prereqs

- `@blackout/design` token coverage audit. Add color + typography tokens if missing.
- Decision: pure-CSS approach vs. `vanilla-extract` (already a `@blackout/client` dep) vs. CSS-in-JS. Recommend `vanilla-extract` for consistency with the canonical client.

### Exit criteria

- Every listed primitive ships with a unit test + at least one storybook-style render fixture.
- `apps/blackout-client` imports at least 5 primitives in production code paths (proves the integration is real, not theoretical).
- `apps/blackout-gov` imports at least 3 primitives.
- `apps/blackout-client` MessageComposer's inline styles for the feature menu, attachment chips, and submission button are replaced by primitive usages (eat your own dogfood).
- `pnpm --filter @blackout/ui run build` emits ESM + types cleanly.

### B1 tranche — ✅ DELIVERED (2026-06-14)

First tranche (the essential 8) landed under `@blackout/ui/primitives`:
**Button, IconButton, Input, Badge, Spinner, Stack, Separator, Card** — styled
with vanilla-extract `.css.ts` consuming new `@blackout/design` color /
typography / radii tokens (colors map onto the client theme's CSS-var contract).

- ✅ Each primitive has a unit test + render fixture —
  `apps/blackout-client/tests/unit/ui-primitives/primitives.test.tsx`.
- ✅ `MessageComposer` dogfoods 5 primitives in a production path (send button →
  `Button` + `Spinner` via `loading`, format-mark toolbar → `IconButton`,
  attachment chips → `Badge`, action row → `Stack`).
- ✅ `apps/blackout-gov` consumes the shared design tokens (spacing / typography /
  radii / color contract) via a token-derived `<style>` block — the non-React
  HTML shell reuses tokens rather than React primitives (decision below).
- ✅ `pnpm --filter @blackout/ui run build` emits ESM + types (incl.
  `dist/primitives`).

### B1.1 tranche — ✅ DELIVERED (2026-06-14)

Remaining primitives landed under `@blackout/ui/primitives`: **TextArea, Select,
Checkbox, Radio, Switch, Avatar, EmptyState, Inline, Cluster, Grid, Tabs,
Tooltip, Popover, Menu, Modal, Sheet, Toast (`ToastProvider`/`useToast`)** — same
vanilla-extract + `@blackout/design` token approach as B1.

- ✅ Each primitive has a unit test + render fixture —
  `apps/blackout-client/tests/unit/ui-primitives/primitives-b11.test.tsx` (20 tests).
- ✅ `pnpm --filter @blackout/ui run build` emits ESM + types for the full set.
- Overlays are hand-rolled (no positioning/focus-trap dependency exists in the
  repo): `createPortal` to `document.body` for Modal/Sheet/Toast; CSS placement
  props for Tooltip/Popover/Menu. **Known v1 limitation:** no viewport collision
  detection (smart flip/shift) — tracked as a future enhancement. Native form
  controls (Select/Checkbox/Radio) are styled rather than re-implemented for
  accessibility.
- `react-dom` added to `@blackout/ui` (for `createPortal`); the canonical client
  consumes the primitives from source and dedupes React to its single instance.

With B1 + B1.1 the full Workstream B primitive set ships; remaining Workstream B
work is broader **production adoption** across feature pages (incremental, as
pages are touched) rather than new primitives.

### Decisions (B1)

- **Styling:** vanilla-extract `.css.ts`. Web primitives live under a separate
  `@blackout/ui/primitives` entry so the package's existing React-Native
  boutique components are never pulled into a web bundle. Consumed from source
  (the client's vanilla-extract plugin compiles the `.css.ts`); React is deduped
  to the app's single instance.
- **Gov adoption:** `apps/blackout-gov` is a non-React HTML-string shell, so it
  consumes the shared `@blackout/design` tokens instead of importing React
  primitives.

### Open scope questions

- Should v1 ship a Storybook? (Recommend no — too much infra; keep the test fixtures lightweight.) — **Resolved: no Storybook; lightweight test fixtures.**
- Should v1 prescribe a theming hook (`useTheme`) or should consumers read `@blackout/design` tokens directly? (Recommend latter for v1 simplicity.) — **Resolved: consumers read tokens directly; primitives reference the theme CSS-var contract.**

### Size

XL (~3–4 weeks for the full primitive set + canonical-client adoption + tests). Splittable: primitives in tranches of 5–6, each tranche L. **B1 (essential 8) delivered 2026-06-14; B1.1 remains.**

---

## Workstream C — Reactions / Threading parity hardening

Both reactions (`m.reaction`) and threads (`m.thread`) are protocol-native
per `discord_parity_blueprint.md` §1. The blueprint marks them "Native"
which means matrix-js-sdk handles the protocol; the gap is canonical-client
UX polish.

### Scope

- **Reactions:**
  - Aggregated reaction bar under each event with per-reactor tooltip.
  - Reaction picker (overlap with UI primitives v1 `Popover` once available; can ship interim ad-hoc picker).
  - Recent / frequent reaction shortcut row.
  - Custom emoji rendering pulled from `@blackout/sdk` emoji helper (or adopt MSC2545 packs).
  - Optimistic add/remove with rollback on send failure.
- **Threading:**
  - Thread sidebar panel mirroring reply tree from a root event (consumes the Slate-backed composer in thread mode — `target.mode = 'thread'` already exists in `MessageComposer`).
  - Thread unread / activity badges driven by BKL-011's `aggregateThreadUnread` + `applyThreadActivityUpdate` SDK helpers.
  - "Jump to thread" action from main timeline → thread root event.
  - Thread list view (which threads am I active in / mentioned in?) — consumes BKL-011's `ThreadActivityPage` if surfaced via the IA.

### Prereqs

- Workstream A Port 1 (canonical ClientLayout adoption) complete — threading panel needs a stable right-panel host.
- Workstream A Port 3 (notifications + presence digest UI) recommended — thread activity badging shares unread-aggregation pathways.
- UI Primitives v1 `Popover` + `Tooltip` recommended but not required (interim ad-hoc reactions UI works).

### Exit criteria — ✅ CLOSED (2026-06-13)

- ✅ Reaction bar renders aggregated counts + reactors; double-click on own reaction removes it.
- ✅ Reaction picker accessible by keyboard; recent reactions persist per device.
- ✅ Thread panel renders root + replies + composer in thread mode; `MessageComposer` `target.mode='thread'` integration works end-to-end (`ThreadPanel` wired into `panelSlots.tsx` `threads` slot).
- ✅ Thread unread badge in left-panel updates within one tick of an `m.thread` reply landing (`ThreadUnreadBadgeMount` in `CanopySidebar.tsx`).
- ✅ Page-level tests cover: reaction add / remove / aggregate, thread reply post, unread badge update on inbound reply — `apps/blackout-client/tests/unit/features/threading-parity/workstreamC.roundtrip.test.tsx`.

### Size

L (5–7 days). Reactions and threading can ship as two PRs.

---

## Workstream D — Discord Parity Phase 2 (rich media + voice)

Per `discord_parity_blueprint.md` §8 phased roadmap weeks 5–8.

### Scope

- Rich-media uploads: image / video / audio / file with preview + drag-drop. Largely covered by Workstream A Port 4 (BKL-006 media pipeline rewire) plus UI Primitives v1 `Modal` / `Sheet`.
- Voice messages: capacitor-bridged native recording (already prototyped in `MessageComposer.startVoiceRecording`); needs polished waveform UI, server upload, playback inline.
- GIF picker: Tenor or Giphy integration (3rd-party, requires API key + service config).
  **Status update (2026-07-11):** shipped with **Giphy as the decided provider** (open
  question 2 below). `packages/api/src/routes/giphy.ts` +
  `integrations/giphy/client.ts` proxy Giphy behind the same wire contract as the
  existing Tenor proxy (search/featured/binary, server-held key, SSRF-guarded CDN
  proxy); the client's provider-agnostic `gifClient.ts` prefers Giphy and falls back
  to Tenor when `GIPHY_API_KEY` is unset, with provider-aware attribution in the
  picker panel. Send-as-image + search-as-you-type were already live via the Tenor
  slice; per-device recents remain open.
- 1:1 RTC baseline: MatrixRTC + LiveKit signal — partial today; needs canonical-client launcher (Port 4 covers Element Call) and call-state UI.
- Group RTC baseline: same stack, larger UX surface (call rail, screen-share preview).

### Prereqs

- Workstream A Port 4 (BKL-006) complete.
- UI Primitives v1 (Modal, Sheet, Tabs) for media-attachment UI.
- Decision on GIF provider (Tenor vs Giphy) — affects API contracts + ToS review.

### Exit criteria

- Drag-drop + paste-image flow end-to-end through `MessageComposer.attachments` to encrypted media upload.
- Voice messages: record → preview → cancel → send → inline playback in timeline.
- GIF picker: search-as-you-type, send-as-image, recents persisted per device.
- 1:1 + group call launch from a room flows into a working LiveKit session with audio + video toggles.

### Size

XL (~3–4 weeks).

---

## Workstream E — Discord Parity Phase 3 (community + governance)

Per `discord_parity_blueprint.md` §8 weeks 9–12. Covers custom-emoji /
sticker packs, onboarding/welcome flow, AutoMod, raid protection, audit
tooling.

### Status update — 2026-07-11

An on-disk audit found this workstream substantially built despite the
"scoped, not started" status below; two gaps were closed on
`claude/stubs-placeholders-4xqu8t`:

- **Custom emoji/stickers (MSC2545): DONE.** Full `im.ponies` plugin, pack
  CRUD UI (user/room/global), and composer emoji board already existed. The
  one open seam — the reactions picker only read the current room's state,
  missing user/global packs — is closed: `useReactionCustomEmoji` resolves
  through `useRelevantImagePacks` with room-state entries winning shortcode
  conflicts.
- **Welcome/onboarding: already built** (`co.bmc.welcome` /
  `co.bmc.onboarding` events, `WelcomeEditor`, `OnboardingWizard`,
  account-data gating).
- **Mjolnir UI (BKL-009): backend landed.** The `/v1/moderation/mjolnir/*`
  REST surface the SDK targeted never existed in `packages/api`; it now does
  (banlists + protections module, per-subject store, changed-event
  envelopes).
- **AutoMod / raid protection: config surfaces already built**
  (`AutoModPanel` writes `co.bmc.automod`; Draupnir console + `ModActionLog`
  audit view ship). Enforcement — a bot/appservice that *reads*
  `co.bmc.automod` and actuates raid lockdown — remains genuinely external
  (Draupnir sidecar), the only true cross-team dependency left here.
- **Slowmode: already built + client-enforced** (`co.bmc.slowmode`).
- **Verification/join gates: still genuinely unstarted** — the one remaining
  pure-code E item (only `newAccountRestrictions` config exists today).

### Scope

- Custom emoji + sticker packs (MSC2545): space-managed pack lifecycle, UI to create/edit/delete packs, picker integration.
- Onboarding / welcome screens: capability-gated walkthrough on first room/space join. Tie to `co.bmc.welcome` + `co.bmc.onboarding` state events from the blueprint.
- AutoMod: appservice-driven moderation policy engine. Needs server-side scaffolding before client UI lands.
- Raid protection: account-data toggles plus appservice rate-limiter; canonical-client surface in moderation settings (compose with BKL-009 Mjolnir UI).
- Audit log: combined state-event history + moderator action stream view. Compose with BKL-009.

### Prereqs

- Workstream A Port 5 (settings IA rewire including Mjolnir).
- Workstream C reactions complete (custom-emoji picker shares the reactions picker).
- AutoMod / raid-protection appservice scaffolding stood up by platform team. **Cross-team dependency.**

### Exit criteria

- Custom emoji picker uses MSC2545 packs end-to-end.
- AutoMod ruleset editable from canonical settings; rule fires on a synthetic test event.
- Raid-protection toggle visible in moderation settings; effective change observable on appservice telemetry.
- Audit log view shows latest moderator actions + state transitions for a room with filters.

### Size

XL (~4 weeks). AutoMod alone is L; depends heavily on appservice readiness.

---

## Workstream F — Discord Parity Phase 4 (polish + parity)

Per `discord_parity_blueprint.md` §8 weeks 13–16. Closing pass.

### Status update — 2026-07-11

Five of the six F items landed on `claude/stubs-placeholders-4xqu8t`:

- **Quick switcher — recent-messages source: DONE.** `collectRecentMessages`
  taps each room's live timeline (last-N `m.room.message`, per-room + total
  caps), feeds `buildQuickSwitcherIndex`, rebuilds on `Room.timeline`, and a
  new `Messages` activate branch opens the room via the mention-inbox jump
  path (`openRoomWithContext` → `roomJumpTargetEventIdAtom`).
- **Themes — no-flash boot: DONE.** `index.html` pre-hydration guard paints
  the persisted theme (light_grove / amoled_night / legacy aliases) before
  first paint; `applyThemeToRoot` clears the boot seeds when the real
  vanilla-extract class lands. Parity + behavior suites lock the inline map
  to `theme-engine.ts`.
- **Accessibility — overlay primitives: DONE.** `@blackout/ui` gains a
  dependency-free `useFocusTrap` (Modal/Sheet), Menu focus-restore + Home/End,
  Tooltip Escape, Popover non-modal focus contract, tone-aware Toast live
  regions. 10-case a11y suite.
- **Profiles: DONE.** Server-stamped immutable `memberSince` on the profile
  record, exposed on the public projection and rendered on ProfilePage +
  MiniProfile ("Member since …").
- **Advanced notification controls: DONE.** `NotificationRulePayload.roomId`
  (protocol), the previously-missing `/v1/notifications/rules` backend
  (per-subject store, room-scoped keys), SDK `roomId` on delete plus
  `resolveEffectiveNotificationRule` precedence helper, and a room-override
  field in the rules editor.
- **Stage channels: CARVED OUT to a Phase 5** — resolving open question Q4
  below. They depend on Workstream D's RTC baseline (MatrixRTC + LiveKit group
  surface), which is not started; shipping F's pure-code polish without them
  was the useful cut. Re-scope stage channels together with D.

### Scope

- Quick switcher: cmd-K palette across rooms, members, recent messages, settings. **Index + ranking slice landed 2026-05-07** on `claude/code-debt-cleanup-QW0bb`: `buildQuickSwitcherIndex` and `rankQuickSwitcherResults` are exported with deterministic exact > recent > unread > fuzzy ordering, the unit test file is un-quarantined, and the smoke `it.skip` is re-enabled. Remaining: recent-messages search source.
- Advanced notification controls: per-room overrides UI on top of BKL-004 rules editor.
- Profiles: rich profile pages with custom status, banners, member-since metadata.
- Themes: light / AMOLED token rollout against design tokens; per-component parity via the new UI primitives.
- Accessibility: keyboard nav coverage, ARIA labels, focus-trap audit on all dialogs (already partially in MessageComposer via `focus-trap-react`).
- Stage channels: large-room broadcast surface using MatrixRTC + the federation-boost tier policy from BKL-010.

### Prereqs

- All previous workstreams.

### Exit criteria

- Quick switcher returns ranked results across all four entry kinds (room/member/message/setting) with deterministic tests. *(rooms/spaces/DMs/members/pages/commands/actions/settings landed 2026-05-07; recent-messages source still pending.)*
- Theme switcher in canonical settings flips light/AMOLED tokens with no flash; theme parity tests cover all UI primitives.
- Stage channel: stage host can promote/demote speakers; viewers see speaker rail; works in a federated test room.

### Size

XL (~4 weeks).

---

## Cross-cutting tracking

- **Single source of truth for scoping:** the migration backlog
  (`docs/architecture/frontend-consolidation-migration-backlog.md`) for
  feature_id-level traceability. This doc layers sequencing on top.
- **Status updates:** add a `## Status update — <date>` section at the top
  of each workstream (mirroring the migration backlog convention) when
  Workstream A starts.
- **Pre-existing test debt:** Resolved 2026-05-07 — the
  `apps/blackout-client/tests/unit/features/navigation/QuickSwitcher.test.tsx`
  quarantine has been lifted after the missing `buildQuickSwitcherIndex` /
  `rankQuickSwitcherResults` helpers were implemented and assertion drift was
  reconciled.

## Test debt — quarantined unit tests (2026-05-01)

When CI was repointed from `@blackout/blackout-web` (legacy shell archived
2026-05-01) to `@blackout/client`, 17 pre-existing broken test files
surfaced. Two were fixed in-place (an `act` import was being read from
`react` instead of `react-dom/test-utils`, breaking `GovernanceDashboard`
and `GlobalMentionsInbox`). Six plugin-test files were un-quarantined on
2026-05-02 after the underlying source modules landed and the test import
paths were corrected from a stale `../../../../../src` (5 levels up) to
the canonical `../../../../src` (4 levels up — project root); the
composer / notifications manifest-order assertions were updated to
include the `live-interaction.bundle` plugin added after the tests were
quarantined. `tests/unit/features/navigation/QuickSwitcher.test.tsx` was
un-quarantined 2026-05-07 once `buildQuickSwitcherIndex` /
`rankQuickSwitcherResults` were implemented.

### 2026-05-13 cleanup — 5 of 8 cleared

On `claude/check-production-readiness-SaDjy` (commit
`<this commit>`):

- **Retired** (3 files deleted, dropped from exclude list):
  - `tests/unit/utils/room.test.ts` — tested 8 helper functions
    (`getRoomName`, `getRoomAvatar`, `getRoomTopic`, `isDM`,
    `getRoomType`, `getJoinedMembers`, `getPowerLevel`, `canDoAction`).
    Only `isSpace` actually exists in `src/app/utils/room.ts`; the
    other 8 were a planned API that never landed. There is no
    underlying behaviour to validate.
  - `tests/unit/parity/baselineResetSnapshotParity.test.tsx` and
    `tests/unit/parity/monetizationLayoutParity.test.tsx` — parity
    snapshots against `shellLayoutPlugin.isEnabled === false` /
    `hasLegacyFallbackEnabled === false` paths, i.e. the legacy
    Cinny shell archived 2026-05-01 in `legacy/blackout-web`. The
    comparison target no longer ships; the snapshots are meaningless.
- **Fixed** (1 file un-quarantined):
  - `tests/unit/features/monetization/monetizationRegistrySafetyMatrix.test.tsx`
    — the manifest now intentionally double-registers the
    monetization route catalog (once as a "suite" SKU bundling all
    8 routes, once per per-SKU customization). The route-assertion
    flatmap therefore yielded 16 entries vs the test's expected 8.
    Test now deduplicates via `new Set(...)` and asserts the unique
    catalog (`apps/blackout-client/tests/unit/features/monetization/monetizationRegistrySafetyMatrix.test.tsx:108-127`).
- **Coverage gates wired and ratcheted** (`apps/blackout-client/vitest.config.ts`):
  - Added `@vitest/coverage-v8` to `devDependencies` and a
    `test:coverage` script. The previous thresholds (60/55/60/60) had
    never been enforced because neither the dep nor a `--coverage`
    invocation existed.
  - Thresholds reset to a no-regression floor matching current
    actual coverage (~19.6/60.08/26.06/19.6): **statements 18 /
    branches 58 / functions 25 / lines 18**.
  - CI: `.github/workflows/ci.yml`'s `unit-tests` job now runs
    `pnpm --filter @blackout/client run test:coverage` so the floor
    is enforced on every PR.

The remaining 3 are still quarantined pending Workstream A Port 1
(ClientLayout adapter shape + render contract):

| File | Failure mode | Likely fix |
| --- | --- | --- |
| `tests/unit/features/moderation/draupnir/DraupnirNavigation.test.tsx` | Asserts a "Moderation" nav link the modern shell does not render yet | Refresh after Workstream A Port 1 lands |
| `tests/unit/pages/client/ClientLayout.test.tsx` | Asserts elements the modern shell does not render yet (current run errors at `client.getRoom is not a function` + `room.currentState?.getStateEvents(...)?.getContent`) | Refresh after Workstream A Port 1 lands |
| `tests/unit/features/room/RoomView.layout.test.tsx` | Test environment / assertion drift | Refresh after Workstream A Port 1 lands |

Adding to or removing from the exclude list **must** be paired with a
matching update here. The vitest config has a `// see deferred-bodies-schedule`
pointer to keep the two in sync.

### 2026-05-13 cleanup — last 3 un-quarantined; 7 scenario `it.skip`s remain

On `claude/check-production-readiness-SaDjy`:

All three remaining file-level quarantine entries were lifted by
refreshing the matrix-client mocks against the current adapter surface
(`getAccountData`, `removeListener`, `getRoom`, `getRoomPushRule`,
`getCrypto`, `getHomeserverUrl`, `getLiveTimeline().getState()`,
non-empty feature `customizations`, `m.room.create` state event,
`getSender`/`getRelation` on MatrixEvent mocks). A shared helper
`apps/blackout-client/tests/helpers/fakeMatrixClient.ts` exposes
`createFakeMatrixClient` + `createFakeRoom` for future tests.

After the refresh:

- `DraupnirNavigation.test.tsx`: 1/1 cases pass.
- `RoomView.layout.test.tsx`: 1/1 cases pass (also needed
  `flushSync` + a `QuestSheet` mock).
- `ClientLayout.test.tsx`: 10 of 17 cases pass. Seven cases remain
  `it.skip` with inline explanations, all blocked on either:
  - a richer `QuickSwitcher` test stub that simulates the
    `<input placeholder="Search rooms, …">` + Enter/Escape/Arrow
    handlers (5 cases: open-switcher, arrow-nav, queues-slash,
    validation-message, /leave + /join), or
  - assertion updates against UI shape drift (1 case:
    threads/pins/search "Close" text), or
  - a rewrite against the post-Workstream-B settings drawer
    (1 case: mobile room organization).

The vitest config exclude list is now empty (header comment updated
accordingly). Coverage thresholds ratcheted to the new floor
(statements/lines 23 / branches 62 / functions 27) against current
actual ~23.78 / 63.80 / 27.47 measured across **843 tests / 147
files** (up from 831 / 144 before this work).

Open follow-up: when un-skipping the 7 ClientLayout cases above,
also bump the vitest threshold floors to track the new actual
coverage measurement.

### 2026-05-13 cleanup — sixth follow-up — 7 `it.skip`s cleared

On `claude/prepare-deployment-Xj8R7`:

The 7 remaining `it.skip` cases in `ClientLayout.test.tsx` were
all cleared. Diagnosis showed the original skip comments were
misleading — the QuickSwitcher cases were failing on a stale
placeholder selector (the real component renders
`Search rooms, spaces, DMs, members, settings, actions`), not on
a missing behavioural stub, and the "settings drawer no longer
renders Room organization" comment was wrong (only the aria-label
changed when terminology migrated to "Den"). Approach:

1. Four stable `data-testid` attributes were added in source —
   `right-panel` and `mobile-den-organization` on
   `apps/blackout-client/src/app/pages/client/ClientLayout.tsx`
   and `quick-switcher-input` on
   `apps/blackout-client/src/app/features/navigation/QuickSwitcher.tsx`.
2. The 9 stale `input[placeholder="…"]` selectors in the test
   file were replaced with `[data-testid="quick-switcher-input"]`.
3. The terminology-driven assertion strings (`Select a room`,
   `All rooms`) were rewritten as regex matches against the
   actual live strings (`Select a den`, `All dens`).
4. The threads/pins/search test was rewritten to (a) seed
   `makeRoom({ timelineEvents })` so the live
   `useLegacyRoomTimelineAdapter` surfaces events to the
   right-panel renderer, (b) scope row-button find to
   `[data-testid="right-panel"] button` so it cannot match the
   rail's `Threads` toggle, and (c) assert aside unmount via the
   testid rather than absence of the literal `Close` substring.

Result: `ClientLayout.test.tsx` is **17 passed, 0 skipped**. No
behavioural stub for `QuickSwitcher` was needed — the real
component renders fine under the existing test provider. No
`useCapabilityContext` mock was needed either. The vitest
threshold floors did not change because the un-skipped tests
exercise paths already covered by the surrounding passing
suite.

## Open scope questions for the next session

1. **UI Primitives styling:** vanilla-extract vs CSS-in-JS vs pure CSS? (Recommended: vanilla-extract for consistency with `apps/blackout-client`.)
2. **GIF picker provider:** Tenor or Giphy? (Affects API contract + ToS.) —
   **Resolved 2026-07-11: Giphy**, proxied at `/v1/integrations/giphy` with the
   Tenor proxy retained as a fallback for deployments that only hold a Tenor key
   (the client resolves Giphy → Tenor at runtime; see the D scope status update).
3. **AutoMod appservice ownership:** which team stands up the policy-engine appservice that Workstream E depends on?
4. **Stage channels deferral:** worth landing Phase 4 with stage channels, or carve them out as Phase 5? — **Resolved 2026-07-11: carved out as Phase 5**, re-scoped alongside Workstream D's RTC baseline (see the F status update above).
5. **Should Workstream B (UI primitives) split into v1.0 (essential 8 primitives) and v1.1 (full set)?** v1.0 is L, v1.1 is L on top.
