# Unfinished Items Triage — May 2026

- Branch: `claude/review-unfinished-items-bLx3q` (merged); follow-up
  call-site integrations land on
  `claude/complete-call-site-integrations-7dZf2` (#1 ThreadPanel mount,
  #2 ThreadUnreadBadge sidebar mount, #3 native pickPhoto in composer,
  #4 Reactions Matrix-mock tests). Remaining open items: T2-01 (Design
  SVGs) and T2-02 (server-side `StreamRecord.den_id` migration).
- Base commit: `01fd4a2` (Merge PR #634 — `claude/prepare-deployment-Xj8R7`)
- Scope: full repository at `/home/user/blackout` — every workspace, every doc tracker
- Methodology: code-marker grep (TODO/FIXME/XXX/HACK, `it.skip`/`describe.skip`/`xit`/`xdescribe`/`it.todo`, `@ts-ignore`/`@ts-expect-error`, "not implemented" / stub markers), review of status/roadmap markdown trackers, cross-reference against `docs/audits/production_readiness_2026_05.md` and `docs/architecture/deferred-bodies-schedule-2026-05-01.md`
- Companion to `docs/audits/production_readiness_2026_05.md` (closed-state gap register) and `docs/architecture/deferred-bodies-schedule-2026-05-01.md` (forward-looking workstream sequencing).

---

## 0. Update — 2026-06 code-debt pass (`claude/code-debt-repo-gaps`)

A fresh re-scan against `develop` confirmed the carry list shrank further;
this branch closed the remaining tractable code items:

- **Invitations pagination** — the standing TODO in
  `packages/api/src/services/invitations.ts` is closed. `GET /v1/invitations`
  now takes `limit` + a `before` cursor and returns `nextCursor`/`hasMore`
  (backward-compatible). The cheap `label`/cursor filters push down into
  `store.listInvitationTokensByCreator`; the derived `state` filter stays in
  the service and pagination is applied after it.
- **Notification thread-level deep routing (client slice)** — the gap noted in
  `KNOWN_LIMITATIONS.md` ("native-bridge contract carries `roomId` only") is
  closed on the client: `NotificationInteractedEvent.threadRootEventId`,
  mobile push forwarding, `NativeBridgeListener` `?thread=&event=` routing, and
  `CommunitiesRoute` → `activeThreadRootIdAtom`. Remaining end-to-end work is
  the Sygnal push payload (homeserver-config), tracked in `KNOWN_LIMITATIONS.md`.
- **T4-04 composer call-site swap** — confirmed already CLOSED on `develop`:
  `useAttachPhoto` calls `pickPhotoAttachment` on native viewports and falls
  back to the hidden file input otherwise.
- **Workstream B adoption** — one more production adopter landed:
  `MutualAidPage` now consumes `@blackout/ui` primitives (Button/Input/
  TextArea/Checkbox/Stack/Card), alongside `MessageComposer`.

Still genuinely open (unchanged): **T2-01** (`QuestionSize.tsx` solarpunk SVGs,
blocked on design delivery).

---

## 1. Executive summary

The repository is in unusually good shape for a project of this size:

- `docs/audits/production_readiness_2026_05.md` §3 — **all 12 BL-PR launch gaps Closed** as of the 2026-05-13 replay at `fe4c9ce`.
- `docs/unfinished-code-checklist.md` — **0 open** TODO/FIXME/TBD/not-implemented markers tracked in scope; 79 historical items resolved.
- `apps/blackout-client/vitest.config.ts` — exclude list is **empty**; 0 file-level quarantines.
- `grep -rE "\.skip\(|xit\(|xdescribe\(" --include="*.test.*"` over the whole repo — **0 actual skipped test calls** outside `legacy/`.

What remains is a small carry list and a large but-clearly-scoped feature backlog. This document triages the carry list into tiers, proposes an order of attack, and identifies the existing utilities to reuse so any future work doesn't re-derive primitives.

## 2. Triage summary

| Bucket | Items | Tractable now? |
| --- | --- | --- |
| Doc debt (stale comment) | 1 | **Resolved this branch** (commit `c7b7ffc`) |
| Code-level TODOs in production paths | 2 | No — both blocked on external inputs (design assets, server schema) |
| Operational unblock | 1 | No in CI sandbox — needs a real dev clone with `origin` configured |
| Multi-week feature workstreams | 6 (Workstreams A–F in `deferred-bodies-schedule-2026-05-01.md`) | Partially — Workstream A Ports 2–5 are well-scoped |
| Phase-ordered monorepo port plan | `MIGRATION_INVENTORY.md` §G | Largely superseded by Workstream A; status owner needs to confirm |

## 3. Tier register

### Tier 1 — Quick wins (≤ 1 hour)

| ID | Item | Status | Evidence |
| --- | --- | --- | --- |
| T1-01 | Refresh stale header comment in `apps/blackout-client/vitest.config.ts` referencing 7 `it.skip` cases that were already cleared in commit `050fc2f`. | **Closed** on this branch (commit `c7b7ffc`). | `git log --oneline -- apps/blackout-client/vitest.config.ts` |

### Tier 2 — Tractable but blocked-on-input

| ID | Location | Description | Blocker | Estimate after unblock |
| --- | --- | --- | --- | --- |
| T2-01 | `apps/blackout-client/src/app/features/playbook/picker/QuestionSize.tsx:13` (`TODO(plan/B)`) | Replace SequenceCard's leading icon slot with bespoke solarpunk SVGs at `public/res/svg/playbook/q1-size-{trio\|small\|medium\|constellation}.svg`. Component already accepts `leadingIcon`. | Assets do not exist yet. | S |
| T2-02 | `apps/blackout-client/src/app/features/streams/LivestreamViewer.tsx:134` (server-side TODO) | Matrix den chat overlay + product shelf for the livestream viewer. | `StreamRecord` schema in `packages/api` needs a stream→den association before client can wire the overlay. Requires a new migration under `packages/api/src/db/migrations/`. | M |

### Tier 3 — Operational unblock

| ID | Item | Owner | Notes |
| --- | --- | --- | --- |
| T3-01 | Phase 0 archive push: `git push origin archive/element-web-fork` + `git push origin v0-element-fork`, then verify with `git ls-remote --heads --tags origin`. | Platform | `PHASE0_STATUS.md` documents this is blocked in this CI sandbox because no `origin` is configured. Must happen in a clone with push auth before any Phase 1 destructive cleanup. Confirm with the migration owner whether Phase 1 is still planned or has been superseded by Workstream A (Tier 4). |

### Tier 4 — Workstream A: Migration Ports (recommended next track)

Documented in `docs/architecture/deferred-bodies-schedule-2026-05-01.md` §"Workstream A". Port 1 foundation is largely done (registry sidebar + settings list mounted 2026-04-30; legacy quarantine cleared 2026-05-13). The remaining ports are well-scoped, with working SDK actions ready to wire (see §5 below).

#### Port 1 status — 2026-05-13 deep dive

A surface-by-surface map (Explore agent, this branch) found that most of the
original Port 1 scope is **already landed**:

- `LegacyClientLayout` is **retired** (per `apps/blackout-client/src/app/core/features/featureFlags.ts:44-52`, the `shellAppShell` flag is default-on as of PR-10 and the legacy layout + `/room/:roomId` redirect were removed alongside the flip).
- `showAdminEntry` boolean is **retired**; only doc/comment references remain (`apps/blackout-client/src/app/core/features/composition.ts:145`, `.../features/platform-ops/manifest.ts:14`, `.../core/features/types.ts:76`). `composeAdminEntries` + `hasAdminEntries` (`composition.ts:150-166`) are the canonical replacements.
- **Mobile rail** is registry-driven: `BottomTabBar` (`apps/blackout-client/src/app/pages/shell/BottomTabBar.tsx`) renders the canonical five shell-destinations via `RegistryTabBar` reading `kind: 'mobile-tab'`. Filtered by id to keep the bar at exactly five.
- **Desktop primary rail** is registry-driven: `PrimaryRail.tsx:53` mounts `RegistrySidebarList kind="sidebar" mode="rail"`.
- **AppShell** (`apps/blackout-client/src/app/pages/shell/AppShell.tsx`) is the canonical wrapper around every routed destination when `shellAppShell` is on; it owns mode resolution, the mobile bottom-tab bar, and the desktop dynamic right-panel slot. ClientLayout's 3-column shell still mounts under `/communities/...` as an inner destination.
- **Router-integration tests** for shell panel state now cover every canonical destination (`apps/blackout-client/src/app/pages/shell/AppShell.test.tsx:115-200`) — one active-tab assertion per `Home / Communities / Create / Market / Inbox` plus mode-resolution coverage for the schedule-cited `/direct` and `/explore` sub-routes. Pre-existing AppShell tests cover Outlet rendering and mode atom write-through. Added in commit on this branch.

What **still remains** in Port 1's literal scope:

- ~~**`WorkspaceTabBar`**~~ — **landed on this branch.** New component at `apps/blackout-client/src/app/pages/shell/WorkspaceTabBar.tsx` consumes `kind: 'workspace'` panels via `RegistryTabBar`, scoped by top-level path segment so it acts as intra-destination navigation (e.g. on `/governance/*` shows `Governance / Meetings / Treasury`). Mounted in `AppShell.tsx` desktop view as the first child of `<main>`. Five tests in `AppShell.test.tsx`.
- ~~**`DynamicRightPanel` registry adoption**~~ — **landed on this branch.** New component at `apps/blackout-client/src/app/pages/shell/RightPanelTabBar.tsx` consumes `kind: 'right-panel'` panels via `RegistryTabBar`, scoped by top-level path segment. Mounted inside `DynamicRightPanel.tsx` above the descriptor body; the panel now renders when either the descriptor is set OR matching registry entries exist. The legacy-room and none+empty-registry cases still short-circuit to null. Four tests in `AppShell.test.tsx`. Active-state caveat documented in `RightPanelTabBar.tsx`: query-param-based entries (e.g. `to: '/governance?tab=active'`) won't highlight until query-aware matching lands; pure-path entries (`/governance/new`) highlight correctly.
- **`ClientLayout.tsx`'s own room-inspector right panel** (`BASE_RIGHT_PANELS` at line 72-78: `members | threads | pins | search | governance | roles`) is intentionally **not** a candidate for shell-panel-kind replacement — these are local UI state for the room view, not registry-driven destinations. Verified via type definitions (`RightPanelType` in `state/navigation.ts`) and call sites.

**Port 1 status: CLOSED** as of this branch. All three deferred-bodies-schedule exit criteria are satisfied:
1. ✓ `showAdminEntry` retired; `composeAdminEntries`/`hasAdminEntries` are the canonical replacements; no ad-hoc admin-gate booleans remain.
2. ✓ Workspace tabs (`WorkspaceTabBar`) and mobile rail (`BottomTabBar`) both consume the registry composer.
3. ✓ Router-integration tests assert one active-tab state per canonical destination (Home/Communities/Create/Market/Inbox) plus mode resolution for the schedule-cited `/direct` and `/explore` sub-routes.

Bonus beyond the schedule's literal scope: registry adoption for `kind: 'right-panel'` panels via `RightPanelTabBar` mounted in `DynamicRightPanel`, with capability-gated composition.

| ID | Port | Estimate | Status / Scope summary |
| --- | --- | --- | --- |
| T4-01 | **Port 1 finish** — already mostly landed; remaining concrete work is `WorkspaceTabBar` + `DynamicRightPanel` registry adoption. The router-integration test coverage was the last in-scope item and landed on this branch. | Remaining: S–M (1–2 days) | Sub-PRs recommended for the two remaining slices. |
| T4-02 | **Port 2** — render BKL-003 governance scheduler + treasury UI. **CLOSED on this branch.** Investigation found the components (`GovernanceMeetings.tsx`, `GovernanceTreasury.tsx`) already shipped and working: scheduler posts `GovernanceMeetingPayload` and refreshes via `listMeetings`; treasury renders latest snapshot + paginated history with precision-safe string balances; right-panel tab strip is wired through the `RightPanelTabBar` landed in Port 1. The only missing exit criterion was page tests in the BKL-005/BKL-010 shape — added on this branch (`GovernanceMeetings.test.tsx` 6 tests; `GovernanceTreasury.test.tsx` 6 tests; all 12 pass). | Remaining: 0 | Closed. |
| T4-03 | **Port 3** — render BKL-004 notifications + presence digest UI. **CLOSED on this branch.** The components did NOT exist before this work — both `routes.ts` (presence digest) and `settings.ts` (notification rules) shipped pure placeholders. Built on this branch: `notificationsClient.ts` (token-aware wrapper around `createNotificationActions`), `PresenceDigestPage.tsx` (window selector + activity list + optimistic ack with rollback), `NotificationRulesEditor.tsx` (CRUD form + list with optimistic insert/delete rollback + edit-populates-form). Placeholder route replaced at `/notifications/presence-digest`; placeholder settings section replaced for `Notifications / Rules`. Tests: `PresenceDigestPage.test.tsx` (6 tests) + `NotificationRulesEditor.test.tsx` (9 tests) in the BKL-003/BKL-005 shape. All 15 pass. | Remaining: 0 | Closed. |
| T4-04 | **Port 4** — render BKL-006 media + dialpad + Element Call UI. **CLOSED on this branch.** All three placeholder routes replaced. Built on this branch: `mediaCallClient.ts` (token-aware wrapper around `createMediaActions` + `createCallActions` + `buildDialpadIntent`), `MediaUploadWidget.tsx` (upload tracker — progress bar + status label + cancel + completed-detail with `mxc`), `DialpadForm.tsx` (12-key dialpad + sanitized E.164 preview + submit calls `dialpadCall` with `buildDialpadIntent`-shaped payload), `ElementCallLauncher.tsx` (room-id input + `launchCall` with `kind:element-call` + descriptor render + capability-disabled fallback per exit criterion). Tests: `MediaUploadWidget.test.tsx` (7), `DialpadForm.test.tsx` (7), `ElementCallLauncher.test.tsx` (5). All 19 pass. Native composer integration carry-over now half-closed: `pickPhotoAttachment(options)` helper at `apps/blackout-client/src/app/features/room/attachments/pickPhotoAttachment.ts` bridges `nativeMediaBridge.nativePickPhoto`'s `NativePickedPhoto` to a `File` (composer-ready); guards against zero-byte blobs, falls back to a synthetic `photo-${Date.now()}` filename and `application/octet-stream` MIME when the picker reports neither; surfaces `picked.source` for telemetry. Test-double escape hatches (`pickPhoto` + `fileFactory` props) make it unit-testable without Capacitor or the runtime File constructor. 7 unit tests. The MessageComposer call-site swap (replace the hidden-file-input "Attach file" path with `pickPhotoAttachment` on native viewports) remains an open follow-up, but the bridge-to-File adapter is now ready to drop in. | Remaining: composer call-site swap | Closed (helpers shipped; carry-over half-closed). |
| T4-05 | **Port 5** — Settings IA rewire (BKL-007 + BKL-008 + BKL-009). **CLOSED on this branch.** The five real pages (`PreferencesPage`, `SidebarPage`, `LabsPage`, `StegoSettingsTab`, `MjolnirSettingsPage`) all shipped already, but four of them were wired to placeholder components in their `*Settings*.ts` arrays (`settings-parity/settings.ts`, `moderation/mjolnirSettings.ts`). Stego was already wired correctly. Swapped on this branch: settings-parity uses real `PreferencesPage` / `SidebarPage` / `LabsPage`; moderation uses real `MjolnirSettingsPage`. Each page self-sources its fetcher via `useRegistryFetcher(...)` with a no-op stub fallback so the IA renders the real UI even when the fetcher context is not wired. Labs internal visibility is gated by `resolveLabsGate({ configFlag, developerMode })` (already wired in `LabsPage`); the registry-level `settings.labs.show` capability + `settingsParity` flag gate section presence. Tests: `settingsIANavigation.test.tsx` (7 tests) asserts all five sections are reachable from the Settings root, Labs/Steganography/Moderation each hide independently when their capability or flag is dropped, the wrapper returns null when no sections grant, and registration order is stable. Existing module-level assertions (settingsParityModule, mjolnirSettingsModule, stegoToolkitModule) still pass without modification. | Remaining: 0 | Closed. |

**Workstream A status: CLOSED.** All five ports (1–5) closed on this branch. The remaining Workstream A scope per `deferred-bodies-schedule-2026-05-01.md` is the optional cross-cutting concern of `nativeMediaBridge.nativePickPhoto` integration into the message composer — that's a separate work item, not blocking Workstream A's IA exit criteria.
| T4-02 | **Port 2** — render BKL-003 governance scheduler + treasury UI against `createGovernanceActions(client)`. Replace placeholders at `/governance/meetings` and `/governance/treasury`. | M (2–3 days) | Can run in parallel with T4-03/T4-04 after T4-01. |
| T4-03 | **Port 3** — render BKL-004 notification rules editor + presence digest inbox. Drive through `createNotificationActions(client)` + `fetchPresenceDigest` / `acknowledgePresenceDigest`. | M (2–3 days) | Parallel with T4-02 / T4-04. |
| T4-04 | **Port 4** — render BKL-006 media + dialpad + Element Call UI. Wire `createMediaActions` upload widget, `buildDialpadIntent` + `createCallActions(client).dialpadCall`, and Element Call launcher. | L (3–5 days) | Three distinct surfaces; consider sub-PRs. |
| T4-05 | **Port 5** — move BKL-007/008/009 Preferences / Sidebar / Labs / Stego / Mjolnir into the canonical settings IA. | M (2–3 days) | Final pass for Workstream A. |

Workstream A total: **~13–20 days** at the deferred-bodies-schedule sizing.

### Tier 5 — Larger workstreams to triage before committing

Real but should not be started until product/program confirms scope. Each is documented under `docs/architecture/deferred-bodies-schedule-2026-05-01.md` and partially in `DISCORD_PARITY_BUILD_PLAN.md`.

| ID | Workstream | Estimate | Recommendation |
| --- | --- | --- | --- |
| T5-01 | **Workstream B — UI Primitives v1 (`@blackout/ui`)** | XL (~3–4 weeks) | **B1 delivered on `claude/unfinished-work-y92l85` (2026-06-14); B1.1 remains.** Split executed as recommended; token strategy = vanilla-extract. B1 shipped the essential 8 under `@blackout/ui/primitives` (**Button, IconButton, Input, Badge, Spinner, Stack, Separator, Card**) styled with vanilla-extract `.css.ts`, plus new `@blackout/design` `designColors` / `designTypography` / `designRadii` tokens (colors map onto the client theme's CSS-var contract in `apps/blackout-client/src/app/styles/theme.css.ts`). Each primitive has a unit test + render fixture (`apps/blackout-client/tests/unit/ui-primitives/primitives.test.tsx`); `MessageComposer` dogfoods 5 primitives in production (send → `Button`+`Spinner`, format toolbar → `IconButton`, attachment chips → `Badge`, action row → `Stack`); `apps/blackout-gov` (non-React HTML shell) consumes the shared tokens via a token-derived `<style>` block instead of React primitives; `pnpm --filter @blackout/ui run build` emits ESM + types (incl. `dist/primitives`). Consumed from source so the client's vanilla-extract plugin compiles the `.css.ts`, with React deduped to the app's single instance. **B1.1 also delivered (2026-06-14):** TextArea, Select, Checkbox, Radio, Switch, Avatar, EmptyState, Inline, Cluster, Grid, Tabs, Tooltip, Popover, Menu, Modal, Sheet, Toast — 20 unit tests in `apps/blackout-client/tests/unit/ui-primitives/primitives-b11.test.tsx`; overlays hand-rolled (createPortal + CSS placement, no positioning lib in repo; no viewport collision detection in v1). **The full Workstream B primitive set now ships;** remaining work is incremental production adoption across feature pages. See the B1 / B1.1 tranche notes in `docs/architecture/deferred-bodies-schedule-2026-05-01.md`. |
| T5-02 | **Workstream C — Reactions / Threading parity hardening** | L (5–7 days) | **Partial progress on this branch.** Investigation found most reaction UI (`Reactions.tsx`) already ships: aggregated bar with per-reactor tooltip, single-click toggle (effectively meeting the "double-click to remove" criterion via the toggle semantics), recent-reactions in-memory, custom emoji rendering. `MessageComposer.target.mode='thread'` is wired end-to-end. `ThreadActivityPage` ships; `aggregateThreadUnread` + `applyThreadActivityUpdate` SDK helpers ship. **Landed this branch (five slices):** (a) `recentReactionsStorage.ts` (pure module: `loadRecentReactions` / `saveRecentReactions` / `pushRecentReaction`, SSR-safe, quota-safe, MRU semantics) + wired into `Reactions.tsx`'s `useState` lazy init + `sendReaction` persistence (19 unit tests); (b) `EmojiPicker.tsx` extracted from the inline picker in `Reactions.tsx` with `role="dialog"` + `aria-label="Emoji picker"`, auto-focus first emoji button on mount, document-level Escape listener that calls `onClose` (capture-phase so inner handlers can't suppress it), and `data-testid`-instrumented buttons (12 unit tests); (c) `useThreadUnreadCount` React hook backing the eventual left-panel badge — owns a `ThreadActivityUpdatedPayload[]` list, exposes `unreadCount` via `aggregateThreadUnread`, supports `pushActivity` (delegates to `applyThreadActivityUpdate` so dedup-by-activityId + zero-drops + MRU-sort happen synchronously in the next React commit, "within one tick"), `setActivities`, and `reset`. Companion `ThreadUnreadBadge` component renders a status badge with `99+` capping and singular/plural aria-label; returns null when count <= 0. 15 unit tests across hook + badge (no Matrix mocking required); (d) thread-tree helpers in `rightPanelUtils.ts` — `getThreadRootEventId`, `getThreadRootIds` (unique + ordered), `groupThreadReplies` (map of root → replies), `findThreadRoot` (root lookup in the timeline window). Pure functions, no Matrix mocking; 12 unit tests covering relation extraction, non-thread relation rejection, malformed event_id, dedup ordering, empty inputs, and missing-root null fallback; (e) **`ThreadPanel.tsx`** — self-contained in-room thread panel UI that composes the helpers from (d) into a tree: header (root sender + body + timestamp), chronological reply list (each clickable for jump-to-event), composer slot via `renderComposer(rootEventId)` render prop so the parent injects the canonical `MessageComposer` with `target.mode='thread'`. Falls back to a "Reply in thread" button when no composer slot is provided. Empty states for `root missing in window` (pagination hint) and `no replies yet`. Encrypted-preview-safe via `fallbackBody` prop. 11 unit tests cover root + replies render, ordering, empty/missing states, fallback body, composer-slot vs. fallback button, onReply/onJumpToEvent handlers, unrelated-root reply isolation, and the `data-root-event-id` attribute. **Update (2026-06-13): Workstream C exit criteria CLOSED.** All three previously-open items are now landed: (1) `ThreadPanel` is wired into `panelSlots.tsx`'s `threads` slot with a real thread-mode `MessageComposer` injected via `renderComposer`; (2) `ThreadUnreadBadgeMount` (hook + badge) is mounted in the left-panel host `CanopySidebar.tsx`; (3) the last open exit criterion — page-level integration coverage — landed on `claude/unfinished-work-y92l85` as `apps/blackout-client/tests/unit/features/threading-parity/workstreamC.roundtrip.test.tsx` (5 tests): reaction add/remove/aggregate driven through the real `Reactions` component + live `Room.timeline` echo, thread reply post through `ThreadPanel` + the real `sendThread` adapter, and unread-badge update on inbound reply through `useThreadUnreadCount` + `ThreadUnreadBadge`. Depends on T4-01 (closed). |
| T5-03 | **Workstream D — Discord parity Phase 2 (rich media + voice)** | XL (~3–4 weeks) | Depends on T4-04 + Workstream B. GIF provider choice (Tenor vs Giphy) needs a product decision first. |
| T5-04 | **Workstream E — Discord parity Phase 3 (community + governance)** | XL (~4 weeks) | Blocked on cross-team AutoMod appservice ownership. |
| T5-05 | **Workstream F — Discord parity Phase 4 (polish)** | XL (~4 weeks) | Closing pass. **The recent-messages quick-switcher source — the only specific open item flagged in `deferred-bodies-schedule-2026-05-01.md` for this workstream — is closed on this branch.** `buildQuickSwitcherIndex` gained an optional fourth `messages: readonly QuickSwitcherMessageEntry[]` parameter; new `'Messages'` category in `QuickSwitcherCategory` + grouped render slot; per-message preview truncation (140 chars, whitespace collapsed) + sender/room subtitle + `jumpRoomId` + `jumpEventId` fields for the eventual activation handler. Seven new tests cover empty/populated/no-sender/long-preview/blank-skip/whitespace-collapse paths plus a recency tie-breaker assertion. Callers supply messages from whatever timeline source they have; the indexer remains decoupled from the Matrix client. Other Phase 4 items (themes, profiles, accessibility audit, stage channels) remain open. |

### Tier 6 — Status to clarify before touching

| ID | Item | Question |
| --- | --- | --- |
| T6-01 | `MIGRATION_INVENTORY.md` §G — phase-ordered port plan. Lists a 5-step monorepo restructure (Core → Design → UI rebuild → App shells → Deploy adaptation); §H lists 3 open validation items. | Workstream A in the deferred-bodies-schedule appears to be the active execution path. Confirm with the migration owner whether `MIGRATION_INVENTORY.md` is now informational/archival or still drives work. |

## 4. Critical files referenced

- `apps/blackout-client/vitest.config.ts` (T1-01 — resolved)
- `apps/blackout-client/src/app/features/playbook/picker/QuestionSize.tsx` (T2-01)
- `apps/blackout-client/src/app/features/streams/LivestreamViewer.tsx` (T2-02)
- `apps/blackout-client/src/app/pages/client/ClientLayout.tsx` (T4-01)
- `apps/blackout-client/src/app/features/navigation/QuickSwitcher.tsx` (T5-05 recent-messages source)
- `PHASE0_STATUS.md`, `MIGRATION_INVENTORY.md` (T3-01, T6-01)
- `docs/architecture/deferred-bodies-schedule-2026-05-01.md` (master sequencing doc — keeps Tier 4/5 in sync)
- `docs/architecture/frontend-consolidation-migration-backlog.md` (BKL-xxx feature traceability)
- `docs/audits/production_readiness_2026_05.md` (gap-register baseline)
- `docs/unfinished-code-checklist.md` (open queue, currently 0)
- `docs/DEPLOYMENT_READINESS_PLAN.md` (all workstreams Complete per 2026-05-12 replay)

## 5. Reusable utilities / existing SDK actions

When Tier 4 starts, these are ready to wire against (no need to build):

- `createGovernanceActions(client)` — `scheduleMeeting`, `listMeetings`, `cancelMeeting`, `getTreasurySnapshot`, `listTreasurySnapshots`
- `createNotificationActions(client)` — `fetchNotificationRules`, `upsertNotificationRule`, `deleteNotificationRule`
- `fetchPresenceDigest`, `acknowledgePresenceDigest`, `buildPresenceDigest`
- `createMediaActions(client)` — `fetchUploadProgress`, `cancelUpload`, `fetchCompletedUpload`
- `createCallActions(client).dialpadCall`, `buildDialpadIntent`
- Shared test helpers `createFakeMatrixClient` + `createFakeRoom` at `apps/blackout-client/tests/helpers/fakeMatrixClient.ts`
- `buildQuickSwitcherIndex` + `rankQuickSwitcherResults` (T5-05 partial)

## 6. Decisions log

Captured during the 2026-05-13 walkthrough of this review:

| ID | Question | Decision | Notes |
| --- | --- | --- | --- |
| T5-01 | `@blackout/ui` v1 primitives styling approach | **vanilla-extract** | Consistent with `apps/blackout-client`'s existing styling stack; no new build infra. |
| T5-03 | Workstream D GIF picker provider | **Giphy** | Provider lock-in implies Giphy SDK + API key in `packages/api` config; ToS review still required before rollout. |
| T5-04 | Workstream E AutoMod appservice ownership | **Option 3 — adopt Draupnir/Mjolnir (OSS)** | The repo already ships client UI for this path (BKL-009 Mjolnir Settings, un-quarantined `DraupnirNavigation.test.tsx`). Platform/infra commits to deploying + on-calling the Draupnir sidecar (Helm chart, secrets, log routing). |
| T5-05 | Workstream F stage channels: ship inside Phase 4 or carve to Phase 5? | **Phase 4** | No deferral; stage channels are part of the polish/closing pass. |
| T6-01 | `MIGRATION_INVENTORY.md` vs `deferred-bodies-schedule-2026-05-01.md` reconciliation | **Pick the latest (= deferred-bodies-schedule is canonical)** | `MIGRATION_INVENTORY.md` is marked historical/archival with a pointer banner; `audit/phase0/` and `scripts/migration/phase0_audit.sh` remain canonical for Phase 0 traceability. |

Additional decisions captured the same session:

| ID | Question | Decision | Notes |
| --- | --- | --- | --- |
| T2-01 | `QuestionSize.tsx` solarpunk SVGs vs. drop the TODO | **Produce the SVGs (design ticket)** | Design owns delivery of `q1-size-{trio\|small\|medium\|constellation}.svg` under `public/res/svg/playbook/`. TODO remains in code as a tracking marker until assets land; `leadingIcon` prop is already plumbed through `QuestionCardList`. |
| T2-02 | Add `StreamRecord.den_id` vs. scope-cut the livestream chat/shelf | **Add it** | New column on `StreamRecord` (server-side schema + migration under `packages/api/src/db/migrations/`) so `LivestreamViewer.tsx:134` can wire the den chat overlay + product shelf. Tracked as a follow-up work item; not in Port 1 scope. |
| T3-01 | Legacy-shell archive push status | **Superseded by Workstream A** | The Phase 0 archive push (`archive/element-web-fork`, `v0-element-fork`) is no longer a blocker because the destructive Phase 1 cleanup it guarded is replaced by the in-place Workstream A path. Local archive branch + tag + `audit/phase0/` artifacts remain canonical for traceability. `PHASE0_STATUS.md` updated with a banner. |
| T4-01 | Start Workstream A Port 1 now? | **Start now** | Branch `claude/review-unfinished-items-bLx3q` carries the implementation work. See Workstream A Port 1 scope in `deferred-bodies-schedule-2026-05-01.md`. |

## 7. Verification commands

These confirm the survey itself; rerun them on later branches to validate the open carry list has not grown:

1. `grep -rE "\.skip\(|xit\(|xdescribe\(" --include='*.test.*'` over the repo — confirm 0 actual skipped test calls outside `legacy/`.
2. `grep -rnE "TODO|FIXME|XXX|HACK" --include='*.ts' --include='*.tsx'` excluding `node_modules`, `legacy/`, `docs/`, `_port/`, and `*.test.*` — as of the `claude/code-debt-repo-gaps` branch only **1 production TODO remains**: T2-01 (`QuestionSize.tsx`, design-asset blocked). T2-02's `LivestreamViewer` TODO was resolved when the `StreamRecord.denId` association landed; the `invitations.ts` pagination TODO was closed on the code-debt branch (see the 2026-06 update below).
3. `head apps/blackout-client/vitest.config.ts` — confirm exclude list is `[default vitest excludes]` only.
4. `head docs/unfinished-code-checklist.md` — confirm "Open items: 0".
5. Baseline gates (currently passing per `docs/rollout-readiness-status.md`): `pnpm install --no-frozen-lockfile && pnpm lint && pnpm test && pnpm audit --audit-level moderate`.
