# Cognitive Load Audit

Date: 2026-05-18

## Scope

Blackout layers a maximalist feature surface — **63 feature directories**, **40+ top-level routes**, plugins, governance, rooms, overlays, federation, permissions, stego, creator systems, marketplace links — on top of a Matrix client. This audit evaluates that surface against six cognitive-load questions and recommends shippable remediations. All findings are grounded in the canonical frontend at `apps/blackout-client/src/app`.

## Audit questions

1. How many decisions appear at once?
2. How many icons are unexplained?
3. Are there too many simultaneous notifications?
4. Are menus nested too deeply?
5. Does every screen have a primary action?
6. Can a new user explain what to do in 5 seconds?

## Findings summary

| Question | Verdict | Severity |
|---|---|---|
| Q1. Simultaneous decisions | Too many in three high-traffic screens | **High** |
| Q2. Unexplained icons | Three composer icons ship without labels | Medium |
| Q3. Simultaneous notifications | Tabbed drawer pattern — no issue | Low |
| Q4. Menu nesting | Account settings tab and right-panel registry are too deep/wide | **High** |
| Q5. Primary action per screen | Governance lacks one; Plugins/Settings hub lack a recommended default | Medium |
| Q6. New-user 5-second test | Passes at the front door; fails two taps in | Medium |

## Detailed findings

### Q1. Simultaneous decisions

| Surface | File | Simultaneous decisions | Severity |
|---|---|---|---|
| Governance dashboard | `apps/blackout-client/src/app/features/governance/GovernanceDashboard.tsx` | 5 tabs (Active / Past / Create / My Votes / Results) + a 5-metric diagnostics badge + per-proposal "View/Change Vote" + overlapping detail pane that obscures tab nav | High |
| Settings hub | `apps/blackout-client/src/app/features/settings/SettingsPage.tsx` | 11 equally-weighted sections with no grouping (Account, Appearance, Notifications, Privacy, Voice & Video, Accessibility, Keybinds, Developer, Report a Bug, Character Sheet, About) | High |
| Plugin install approval | `apps/blackout-client/src/app/features/plugins/PluginsView.tsx` | 7 capability toggles in one dialog (`shell.panel.read/write`, `message.read/compose`, `storage.read/write`, `http.fetch`); user must read 7 descriptions before approving | High |
| Create-room form | `apps/blackout-client/src/app/components/create-room/*` | Room kind × Federation × Encryption × Knock × Additional creators × Room version × "Advance" — 5+ toggles co-visible | Medium |
| Stego toolkit channel form | `apps/blackout-client/src/app/features/stego-toolkit/StegoToolkitPage.tsx` | 7 fields with conditional visibility (name, audience, carrier, ephemeral_mode, ttl_hours, rotation_days, passphrase) | Medium |
| Onboarding | `apps/blackout-client/src/app/features/onboarding/OnboardingFlow.tsx` | Sequential 5-step wizard — decisions are paced | Low |

### Q2. Unexplained icons

| File:Line | Icon button | Label status |
|---|---|---|
| `apps/blackout-client/src/app/features/room/message/MessageEditor.tsx:291-298` | Formatting / alphabet toggle | No `aria-label`, no tooltip |
| `apps/blackout-client/src/app/features/room/message/MessageEditor.tsx:324-337` | Emoji picker | `aria-pressed` only, no `aria-label` |
| `apps/blackout-client/src/app/features/room/RoomInput.tsx` | Formatting icon | No label |
| `apps/blackout-client/src/app/features/room/MessageComposer.tsx:1023` | "+" composer features | OK — `aria-label="Open composer features"` |
| `apps/blackout-client/src/app/features/room/MessageComposer.tsx:1043` | Steganography toolbox | OK — `aria-label="Open steganography toolbox"` |
| `apps/blackout-client/src/app/features/settings/Settings.tsx:348` | Close settings | OK — `aria-label` present |

The unlabeled icons live in the message composer — the surface every user touches the most.

### Q3. Simultaneous notifications

Notifications use a tabbed drawer (`apps/blackout-client/src/app/features/notifications/components/NotificationsDrawer.tsx`) with three tabs: **Awaits Me / About Me / Pulse**. There are no stacking toasts. Dedup is in place via a `processedEventIds` Set (`NotificationsDrawer.tsx:252`); suppression rules cover quiet hours, global mute, and per-canopy mute. Banners are single-instance and conditional (e.g. `TrialBanner` in `RoomViewHeader.tsx`).

The pattern — segmented tabs + dedup + suppression — is the one to reuse anywhere else we add notifications.

### Q4. Menu nesting

- **Settings → Account is a 15-item single-scroll list.** `apps/blackout-client/src/app/features/settings/Settings.tsx` exposes 11 top-level tabs, but the Account tab alone surfaces 15 subsections in one vertical scroll: Profile, MatrixId, ContactInfo, LinkedAccounts, TwitchChatBridges, YoutubeChatBridges, KickChatBridges, DiscordCompatWebhooks, OutboundEventWebhooks, TwitchIrcBotTokens, ObsWsPasswords, WidgetAlertTokens, SimulcastDestinations, IntegrationsHealth, IgnoredUserList. No sub-grouping. This is the worst single offender in the app.
- **Right panel registry has 19 slots.** `apps/blackout-client/src/app/state/navigation.ts:3-23` defines `RightPanelType` with 19 values: members, threads, pins, search, governance, monetization, roles, townhall_sfu, widget_shell_layouts, media_pipeline, media_spoilers, media_codeblocks, media_link_previews, element_call, matrix_widget_compat, soundboard, numbers_station, stage_channels, notifications. Only one renders at a time, but the registry surfaces 19 entry points and grows freely.
- **Monetization has 9 top-level items**, each with its own sub-pages: Overview, Earnings, Subscriptions, Boosts, Aid Pools, Quests, Marketplace, Apps, Themes (`apps/blackout-client/src/app/features/monetization/MonetizationModuleShell.tsx`).
- **Room Settings / Space Settings** are 5 pages each — manageable but duplicated across two surfaces.

### Q5. Primary action per screen

| Surface | Primary action | OK |
|---|---|---|
| Room view | Send a message (composer anchored bottom) | Yes |
| Home feed | Click a room card; empty-state CTA "Discover canopies" | Yes |
| Communities | Pick a canopy or open discovery | Yes |
| App shell | (chrome — no primary expected) | Yes |
| Federation self-host wizard | Generate blueprint | Yes |
| Governance dashboard | None — 5 tabs with no default focus, no "what should I do now" hint | No |
| Settings hub | "Pick a section" — implicit; no recommended entry | Partial |
| Plugin approval dialog | Approve / Cancel — no "recommended safe defaults" preset | Partial |
| Creator dashboard | Depends on creator state — needs verification | Partial |

### Q6. New-user 5-second test

The front door passes:

- First screen after login is `/` → HomeFeed (`apps/blackout-client/src/app/features/home/HomeFeed.tsx`). Empty state reads: "No activity yet. Join a canopy to start seeing posts in your feed." with a "Discover canopies" link.
- Bottom-tab is 5 items: Home / Communities / Create / Market / Inbox (`apps/blackout-client/src/app/features/shell-destinations/panels.ts`).

The underlying surface does not pass:

- A user who taps Communities or opens the right panel can encounter terminology with no in-product definition: `canopy`, `den`, `coalition`, `coliseum`, `compost`, `deaddrop`, `playbook`, `rounds`, `stego`, `numbers_station`, `townhall_sfu`.
- The Create flow modal immediately surfaces federation/encryption/knock/room-version toggles. There is no "Just create a normal room" express path.

## Recommendations

Each recommendation is sized to fit in a single PR.

### R1. Group the 11 Settings sections into 4

`apps/blackout-client/src/app/features/settings/SettingsPage.tsx` — group into **Account & Identity**, **Look & Feel**, **Privacy & Notifications**, **Help & Advanced**. No route changes; only the sidebar groups visually.

### R2. Default the plugin permission dialog to least-privilege

`apps/blackout-client/src/app/features/plugins/PluginsView.tsx` — show only destructive/network capabilities expanded by default (`http.fetch`, `message.compose`, `storage.write`); collapse read-only caps under a "Show 4 read-only permissions" disclosure. Add a single risk-tier label at the top.

### R3. Give Governance a primary action

`apps/blackout-client/src/app/features/governance/GovernanceDashboard.tsx` — default tab to **Active**; auto-focus the most relevant proposal (the one the user has not voted on). Move the 5-metric diagnostics block behind a `?diagnostics=1` URL param or into Developer settings. Use side-by-side master/detail at desktop widths so tabs are never obscured.

### R4. Add a "Just create a room" express path

`apps/blackout-client/src/app/components/create-room/*`, `features/create-room/*` — the default form should show only a name field. Federation/encryption/knock/version live under an "Advanced" toggle that is collapsed by default. Reuse the existing Advance toggle.

### R5. Trim the right-panel registry to a discoverable set

`apps/blackout-client/src/app/state/navigation.ts:3-23`, `apps/blackout-client/src/app/features/right-panel/RightPanelContent.tsx` — keep 6 visible slots by default (members, threads, pins, search, notifications, governance). Move the other 13 behind a "More panels" overflow menu and only show panels actually wired up for the current room/space. Every right-panel button must have an `aria-label` and `title`.

### R6. Glossary tooltips for Blackout-specific terms

Wrap first occurrences of `canopy`, `den`, `coalition`, `coliseum`, `compost`, `deaddrop`, `playbook`, `numbers_station`, `townhall_sfu`, `stego` with the existing Tooltip primitive, one sentence each.

### R7. Label the unlabeled composer icons

`apps/blackout-client/src/app/features/room/message/MessageEditor.tsx:291-298`, `:324-337`, and `apps/blackout-client/src/app/features/room/RoomInput.tsx` — add `aria-label` and `title` to the formatting toggle, emoji picker, and RoomInput formatting icon. Match the existing labels at `MessageComposer.tsx:1023` and `:1043`.

### R8. Split Settings → Account into sub-tabs

`apps/blackout-client/src/app/features/settings/Settings.tsx` (Account tab) — replace the 15-item scroll with three sub-tabs: **Identity** (Profile, MatrixId, ContactInfo, LinkedAccounts, IgnoredUserList) · **Bridges & Webhooks** (Twitch/Youtube/Kick chat bridges, DiscordCompatWebhooks, OutboundEventWebhooks, TwitchIrcBotTokens, ObsWsPasswords, WidgetAlertTokens, SimulcastDestinations) · **Health** (IntegrationsHealth).

## Patterns to reuse

- **HomeFeed empty-state** (`apps/blackout-client/src/app/features/home/HomeFeed.tsx`) — dashed-border box with a one-line message and a single CTA link. Reuse this exact pattern for any empty surface (governance with no proposals, plugins with none installed, market with no listings) instead of inventing new empty states.
- **Onboarding state machine** (`apps/blackout-client/src/app/features/onboarding/onboardingState.ts`) — demonstrates the "sensible defaults + skip" pattern that any future multi-step flow should mirror (relevant to R2).
- **Shell destinations manifest** (`apps/blackout-client/src/app/features/shell-destinations/manifest.ts`) — manifest-driven registry pattern. The right-panel slot trimming in R5 should adopt this shape instead of growing the `RightPanelType` union by hand.
- **NotificationsDrawer** (`apps/blackout-client/src/app/features/notifications/components/NotificationsDrawer.tsx`) — segmented tabs + dedup + suppression. Reuse anywhere multiple event streams might otherwise stack.

## Verification

End-to-end "5-second test": ask three testers (TESTERS.md) to log in to a fresh account and verbally describe what they would do next. Success criterion: all three say "join a community" or "create a room" within 5 seconds without prompting.

Per-recommendation verification:

1. **R1** — open `/settings`, confirm 4 groups visible; each section route still resolves.
2. **R2** — open plugin install in dev; only network/write caps visible by default; install with defaults works.
3. **R3** — open `/governance`; default tab is Active and an unvoted proposal is focused; diagnostics reachable only via `?diagnostics=1`.
4. **R4** — open create modal; only name field visible; Advanced expands existing toggles; existing E2E in `playwright/` still passes.
5. **R5** — only 6 default slots show buttons; remaining reachable via overflow; every button has a visible tooltip; axe pass.
6. **R6** — visit Communities → canopy → den; hover each Blackout-specific term; tooltip appears with definition.
7. **R7** — axe pass on the message-composer view; manual hover confirms tooltip text on each newly labelled icon.
8. **R8** — open `/settings`; Account tab shows three sub-tabs with the listed grouping; existing settings tests still pass.

## Bottom line

The front door is fine. The trouble starts two taps in, where Blackout's surface area collides with a new user's working memory. The eight remediations above are small, independent, and shippable — each one removes a category of decision overload (Q1, Q2, Q4, Q5, Q6) without changing how the app is architected.
