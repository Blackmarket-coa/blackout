# BLACKOUT
## Cinny Extraction Plan & Custom Build Manifest
### What to Pull • What to Adapt • What to Build from Scratch

**Black Market Coalition — March 2026**

## Table of Contents
1. Extraction Strategy Overview
2. Cinny Architecture Map
3. Extraction Plan: Matrix Integration Layer
4. Extraction Plan: Room & Timeline System
5. Extraction Plan: Message System
6. Extraction Plan: Navigation & Sidebar
7. Extraction Plan: Settings & Notifications
8. External Libraries to Embed (Not from Cinny)
9. The Build-from-Scratch List
10. Integration Sequence & Dependency Graph

## 1. Extraction Strategy Overview
Cinny is a TypeScript + React client built on matrix-js-sdk with Jotai for state management, Slate for rich text editing, Vanilla Extract for CSS, and the folds component library. Blackout shares the same protocol foundation (matrix-js-sdk), which makes Cinny the ideal donor codebase. However, Cinny is AGPL-3.0 licensed, so any code you pull must be used in a way compatible with that license (which is fine for Blackout since it is open-source).

**Action Tags:**
- **PULL** = Copy directly, minimal changes.
- **ADAPT** = Copy and significantly modify for Blackout's needs.
- **BUILD** = Reference Cinny's pattern but write new code.
- **EMBED** = Use external open-source library instead.
- **SKIP** = Not needed or replaced by Blackout-specific feature.

### 1.1 Cinny's Technology Stack (Compatibility Check)
- **React 18.2:** Same version can be used in Blackout. Direct compatibility.
- **matrix-js-sdk 38.2:** Blackout already uses this. All hooks and utilities transfer directly.
- **Jotai 2.6:** Atomic state management. Pull atom definitions and patterns, or swap for Zustand if preferred.
- **Slate 0.112:** Rich text editor framework. Pull the entire message composer; it is the most complex UI piece.
- **Vanilla Extract:** CSS-in-TypeScript. Keep or re-skin with Tailwind/CSS Modules.
- **folds 2.4:** Cinny's component library (`github.com/cinnyapp/folds`). Pull this wholesale as a dependency.
- **i18next:** Internationalization setup and translation files can be pulled directly.
- **@tanstack/react-query 5.24:** Pull query patterns for room data fetching.
- **WASM Crypto:** `@matrix-org/matrix-sdk-crypto-wasm` integration should be pulled for E2EE.

## 2. Cinny Architecture Map
Cinny's `src/` follows a features-based architecture.

- `src/client/` — application initialization, auth/session management bootstrap.
- `src/app/pages/` — page-level components.
  - `pages/auth/`: **ADAPT** (Blackout-branded auth flow).
  - `pages/client/`: **PULL** non-UI features (favicon, notifications, zoom).
- `src/app/features/` — feature modules.
  - `features/settings/`: **ADAPT** with BMC additions.
  - `features/call/`: **PULL** `SmallWidget.ts` for VoIP entry point.
  - `features/room/`: **PULL/ADAPT** room-level shell pieces.
- `src/app/state/` — global Jotai atoms: **PULL**.
- `src/app/hooks/` — matrix-specific hooks: **PULL**.
- `src/app/utils/` — matrix helpers/utilities: **PULL**.
- `src/app/components/` — reusable UI components: **ADAPT** with solarpunk styling.

## 3. Extraction Plan: Matrix Integration Layer
| Cinny Source Path | Component / Module | Action | Blackout Integration Notes |
|---|---|---|---|
| `src/client/` | Client initialization & session | PULL | Matrix client creation, session storage, crypto init, sync start. |
| `src/app/state/` | Jotai atom definitions | PULL | `roomAtom`, `roomToUnreadAtom`, `settingsAtom`, `allInvitesAtom`, etc. |
| `src/app/hooks/usePermission.ts` | Permission state hook | PULL | Browser notification/mic permissions; use as-is. |
| `src/app/hooks/` (room hooks) | Room data hooks | PULL | `useRoom`, `useRoomMembers`, `usePowerLevels`, `useSpaceChildren`. |
| `src/app/utils/` (matrix utils) | Matrix helper functions | PULL | Room/event processing and membership/power-level helpers. |
| WASM crypto integration | E2EE setup | PULL | Vite WASM config + `crypto-wasm` import + key backup setup. |
| `src/app/utils/` (markdown) | Markdown to Matrix HTML | PULL | Parser generating `formatted_body` HTML. |
| i18next config + translations | Internationalization | PULL | Setup and translation JSON files. |

## 4. Extraction Plan: Room & Timeline System
| Component / Module | Action | Blackout Integration Notes |
|---|---|---|
| Room container component | ADAPT | Re-skin room shell (header, timeline, composer). |
| Timeline rendering engine | PULL | Virtual scroll, grouping, separators, live sync updates. |
| Message composition input | PULL | Slate editor, markdown shortcuts, autocomplete, uploads. |
| Room header/nav bar | ADAPT | Add Blackout-specific actions. |
| Thread panel | PULL | `m.thread` relation rendering. |
| Typing indicators | PULL | Subscribes to typing events. |
| Read receipts | PULL | Receipt avatars + `m.fully_read` marker. |
| Reaction bar | PULL | Aggregates and sends `m.reaction` events. |
| Reply composer | PULL | `m.in_reply_to` relation and quote preview. |
| Pinned messages | PULL | `m.room.pinned_events` state reader/panel. |

## 5. Extraction Plan: Message System
| Component / Module | Action | Blackout Integration Notes |
|---|---|---|
| Message editor (Slate) | PULL | Pull plugins/decorators/shortcuts setup. |
| Message bubble rendering | ADAPT | Re-style text/image/video/audio/file renderers. |
| Media handling pipeline | PULL | Upload, thumbnails, `mxc://` resolution, lightbox. |
| HTML sanitizer | PULL | Sanitize `formatted_body` for XSS safety. |
| Code block rendering | PULL | Fenced code parsing + highlighting integration. |
| Spoiler rendering | PULL | `data-mx-spoiler` reveal toggle behavior. |
| Link previews | ADAPT | Extend preview cards for Blackout-specific link types. |
| Message edit UI | PULL | `m.replace` composer edit flow. |
| Message redaction UI | PULL | Redaction confirmation + deleted placeholder rendering. |

## 6. Extraction Plan: Navigation & Sidebar
| Component / Module | Action | Blackout Integration Notes |
|---|---|---|
| Sidebar architecture | ADAPT | Three-column layout with Blackout branding. |
| Space hierarchy rendering | ADAPT | Recursive children, nesting, categorization. |
| Space lobby/overview | ADAPT | Space info, member preview, channel listing. |
| Room list | ADAPT | Sorting, unread indicators, type icons. |
| Unread indicators | PULL | Reuse `roomToUnreadAtom` computation/badges. |
| DM list | PULL | Parse `m.direct` account data and sort DMs. |
| Search UI | ADAPT | `/search` integration with filters/jump-to-message. |
| Room invites | PULL | `allInvitesAtom`, notifications, accept/reject. |
| Explore/discover | ADAPT | Extend public room directory for Blackout discovery. |

## 7. Extraction Plan: Settings & Notifications
| Component / Module | Action | Blackout Integration Notes |
|---|---|---|
| Settings framework | ADAPT | Settings shell + BMC pages. |
| Appearance settings | ADAPT | Replace themes with Blackout palette. |
| Notification settings | PULL | Push rule management and per-room overrides. |
| Background notifications | PULL | Favicon, invites, message notifications, sounds. |
| About page | ADAPT | Rebrand metadata, links, credits. |
| Account settings | ADAPT | Extend profile fields for BMC. |
| Emoji settings | PULL | Twemoji/system emoji toggle. |
| Page zoom | PULL | CSS font-size scaling feature. |
| Element Call integration | PULL | `features/call/SmallWidget.ts` widget embedding. |

## 8. External Libraries to Embed (Not from Cinny)
### 8.1 Voice/Video: Element Call SDK
- **Repo:** `github.com/element-hq/element-call` (AGPL-3.0)
- **Use:** SDK mode for MatrixRTC while building Blackout-native call UI.
- **Infra:** Self-host LiveKit SFU + `lk-jwt-service` alongside Synapse.

### 8.2 Moderation: Draupnir
- **Repo:** `github.com/the-draupnir-project/Draupnir` (AFL-3.0)
- **Use:** Separate moderation service (bans, redactions, anti-spam, ACLs).
- **Blackout addition:** Build admin UI on top of Draupnir management room events.

### 8.3 Emoji Picker: emoji-mart
- **Repo:** `github.com/missive/emoji-mart` (MIT)
- **Use:** full emoji picker with custom emoji packs.
- **Install:** `emoji-mart`, `@emoji-mart/data`, `@emoji-mart/react`.

### 8.4 GIF Search: Tenor API
- Build GIF picker using Tenor API and send as `m.image` with `image/gif`.

### 8.5 Design System: folds
- **Repo:** `github.com/cinnyapp/folds` (AGPL-3.0)
- **Use:** install and theme with Blackout solarpunk palette.

## 9. The Build-from-Scratch List
These features define Blackout's differentiation and should be built natively.

### 9.1 Blackout-Specific Features (`co.bmc.*` namespace)
| Feature | Effort | Priority | Approach / Dependencies |
|---|---|---|---|
| Named Role System (`co.bmc.roles`) | L (2 weeks) | P0 | Role-to-power-level mappings + role-colored UI. |
| Welcome Screen (`co.bmc.welcome`) | M (1 week) | P1 | Space-scoped welcome config modal on first join. |
| Onboarding Flow (`co.bmc.onboarding`) | L (2 weeks) | P1 | Multi-step join wizard persisted in account data. |
| Forum Channels (`co.bmc.forum`) | XL (3 weeks) | P1 | Thread-first mode with tags/sorting/guidelines. |
| Soundboard (`co.bmc.soundboard`) | M (1 week) | P2 | Space clip state events + picker/playback UI. |
| Space Templates (`co.bmc.template`) | M (1 week) | P2 | Export/import space topology as JSON. |
| Server Banner (`co.bmc.banner`) | S (3 days) | P2 | Space header image via `mxc://` state value. |
| Custom Invite Splash | M (1 week) | P2 | Branded invite pre-auth entry page. |

### 9.2 Governance & Cooperative Features
| Feature | Effort | Priority | Approach / Dependencies |
|---|---|---|---|
| Cooperative Governance Tools | XL (3+ weeks) | P1 | Proposals, voting, quorum via room state events. |
| Steganography Layer | L (2 weeks) | P2 | Client-side hidden-message encode/decode in media. |
| Dead Drop Channels | M (1 week) | P2 | Time-delayed message queue/release model. |
| Cell-Structure Routing | L (2 weeks) | P3 | Compartmentalized channel visibility model. |
| Numbers Station Broadcasts | M (1 week) | P3 | Scheduled bot-driven structured broadcasts. |

### 9.3 UI/UX Features Not in Cinny
| Feature | Effort | Priority | Approach / Dependencies |
|---|---|---|---|
| Solarpunk Theme Engine | L (2 weeks) | P0 | CSS variable system mapped to BMC palette. |
| Extended Profile System | M (1 week) | P1 | Banners, markdown bio, avatar decorations. |
| Quick Switcher (Ctrl+K) | M (1 week) | P1 | Fuzzy search dialog for rooms/spaces/users/commands. |
| Server Folders | S (3 days) | P1 | Folder grouping + drag/reorder in account data. |
| Bookmark System | S (3 days) | P2 | Account-data event bookmarks panel/search. |
| Streamer Mode | S (3 days) | P2 | Sensitive info masking across UI. |
| Developer Mode | S (3 days) | P2 | Event inspector/raw JSON/state explorer tools. |
| Activity Status / Rich Presence | M (1 week) | P3 | Presence extension-based custom statuses. |
| DM Permission Controls | M (1 week) | P2 | Friend/mutual-space/request-based DM gate rules. |
| Stage Channels | L (2 weeks) | P2 | LiveKit-backed one-to-many audio with moderation. |

### 9.4 Moderation UI (Client-Side)
| Feature | Effort | Priority | Approach / Dependencies |
|---|---|---|---|
| Timeout System | M (1 week) | P1 | Temporary PL drop + scheduled restoration UX. |
| AutoMod Config Panel | M (1 week) | P1 | `co.bmc.automod` configuration editor. |
| Audit Log Viewer | M (1 week) | P1 | Draupnir management room event timeline UI. |
| Raid Protection UI | S (3 days) | P2 | Join-rate dashboard + manual lockdown controls. |
| Content Warning / NSFW Toggle | S (3 days) | P2 | Room-level NSFW gate for media/content. |
| Slowmode Controls | S (3 days) | P2 | Per-room cooldown + client countdown feedback. |

## 10. Integration Sequence & Dependency Graph
### Wave 1: Foundation (Week 1)
- `src/client/` bootstrap/session/crypto.
- `src/app/state/` Jotai atoms.
- `src/app/hooks/` custom matrix hooks.
- `src/app/utils/` matrix and markdown utilities.
- `folds` library dependency.
- i18next setup and translation files.

### Wave 2: Timeline Core (Week 2)
- Room timeline engine.
- Message rendering.
- Slate message editor.
- Media upload/display handling.
- Reactions, replies, threads.

### Wave 3: Navigation (Week 3)
- Space hierarchy.
- Sidebar layout.
- Room list.
- DM list.
- Search integration.

### Wave 4: Settings & Polish (Week 4)
- Settings framework.
- Background notification features.
- Element Call widget.
- Notification settings.
- Pinned messages/bookmarks.

### Wave 5: Blackout-Only Features (Weeks 5+)
- Solarpunk theme engine.
- Named role system.
- Forum channels.
- Governance tools.
- Moderation UI.
- Steganography/dead drops/cell routing.
- Welcome/onboarding flows.

**Estimate:** ~4 weeks to integrate Cinny foundation + ~8–12 weeks for Blackout-specific features. This extraction strategy is expected to save ~3–4 months versus building equivalent Matrix client capabilities from scratch.
