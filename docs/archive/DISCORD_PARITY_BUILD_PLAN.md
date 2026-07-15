# Discord-Parity Blueprint for Blackout

> **Verified Implementation Status (2026-05-27).** This document is a forward-looking roadmap and
> under-reports what has since shipped. Several features marked Partial/Needs Build/Custom below are
> now **Implemented** in code: group voice/video + screen share and Go-Live streaming
> (`features/call/`, `features/streaming/`), forum channels (`features/forum/`), the role/permission
> system (`features/roles/`), timeout + AutoMod moderation (`features/moderation/`), and member
> onboarding + discovery (`features/onboarding/`, `features/discovery/`). For the code-verified
> status, see [`docs/audits/discord-comparative-analysis-2026-05-27.md`](docs/audits/discord-comparative-analysis-2026-05-27.md).
> The roadmap content below is retained for architectural rationale.

## 1. Executive Summary

This document provides a comprehensive blueprint for replicating Discord's user-facing features within Blackout, the BMC ecosystem's encrypted communication platform. Blackout is built as a custom client on `matrix-js-sdk`, running against a Synapse homeserver with end-to-end encryption as a non-negotiable baseline.

The approach leverages Matrix protocol's native capabilities wherever possible, identifies gaps requiring custom implementation, and provides a phased roadmap prioritized by user impact. Features are organized by category, with each entry mapping the Discord feature to its Matrix/Blackout equivalent, current implementation status, and technical guidance.

**Status Legend**

- **Native** = Matrix protocol supports natively.
- **Partial** = Matrix supports core, Blackout needs UI.
- **Custom** = Requires Blackout-specific code.
- **Needs Build** = Significant development effort.
- **3rd Party** = External service/integration.

---

## 2. Feature Mapping: Messaging & Emoji

### 2.1 Core Messaging

| Discord Feature | Blackout Equivalent | Status | Implementation Notes |
|---|---|---|---|
| Text channels | Matrix rooms (`m.room.message`) | Native | Rooms are the fundamental unit. Use room types to differentiate channel kinds. |
| Direct messages | Direct rooms (`is_direct` flag) | Native | `matrix-js-sdk createRoom({ is_direct: true })`. Store DM mapping in account data. |
| Group DMs | Private rooms (invite-only) | Native | `createRoom` with invite list, no space parent. Cap at ~10 members in UI. |
| Threads | `m.thread` relation (MSC3440) | Native | Synapse supports threading. Render thread panel in sidebar. Thread root = original message. |
| Reply to message | `m.relates_to` (`m.in_reply_to`) | Native | Standard reply relation. Render quoted parent above reply in timeline. |
| Mention users (@) | Matrix user pill (`@user:server`) | Native | Render @-mention autocomplete from room members. Use `data-mx-pill` format in HTML body. |
| Mention roles | Power level group mentions | Custom | Matrix has no roles. Build custom role system in room state, resolve `@role` to member list. |
| Mention channels (#) | Room pill (`matrix.to` link) | Partial | Link to room via `matrix.to` URI. Build #-channel autocomplete from space children. |
| Slash commands | Custom command parser | Custom | No native slash commands. Build client-side parser dispatching to bot or local actions. |
| Message editing | `m.replace` relation | Native | Send replacement event with `m.new_content`. Show `(edited)` indicator. |
| Message deletion | `m.room.redaction` | Native | Redaction removes content server-side. Show `[message deleted]` placeholder. |
| Markdown formatting | `org.matrix.custom.html` | Native | Send both plain text (`body`) and HTML (`formatted_body`). Parse markdown client-side. |
| Code blocks | HTML `<pre><code>` | Native | Render fenced code blocks with syntax highlighting (highlight.js or Prism). |
| Spoiler tags | Spoiler span in HTML | Native | Use `<span data-mx-spoiler>` in `formatted_body`. Render with click-to-reveal UI. |
| Message scheduling | Scheduled send queue | Custom | No protocol support. Build client-side queue with local storage, send at scheduled time. |

### 2.2 Emoji, Reactions & Stickers

| Discord Feature | Blackout Equivalent | Status | Implementation Notes |
|---|---|---|---|
| Emoji picker | Unicode emoji picker | Custom | Build emoji picker component with search, skin tones, recents, and category tabs. |
| Custom server emojis | Custom emoji via room state | Custom | Store custom emoji packs in room state events (MSC2545 image packs). Render in picker. |
| Animated emojis | Animated image packs | Custom | Support GIF/APNG/Lottie in emoji packs. Gate animated renders behind a setting. |
| Emoji search | Picker search filter | Custom | Index emoji by name, aliases, keywords. Fuzzy search with shortcode autocomplete (`:thumbsup:`). |
| Reaction adding | `m.reaction` relation | Native | Send `m.reaction` event with key (emoji). Aggregate and render reaction bar below message. |
| Super reactions | Custom reaction animation | Custom | Cosmetic upgrade. Animate reaction with particle effects. Optional paid/Nitro-equivalent gate. |
| Sticker sending | `m.sticker` event type | Native | Matrix has native sticker support. Build sticker picker, store packs in account data. |
| Custom stickers | MSC2545 sticker packs | Partial | Store sticker packs as state events. Allow space admins to add/manage community packs. |
| Soundboard clips | Audio message snippets | Custom | No protocol support. Build soundboard UI, send short audio `m.room.message` with `msgtype: m.audio`. |
| GIF picker | Tenor/Giphy integration | 3rd Party | Integrate Tenor API for GIF search. Send selected GIF as `m.image` with `image/gif` mimetype. |

---

## 3. Feature Mapping: Server/Space Structure & Permissions

### 3.1 Space & Channel Architecture

| Discord Feature | Blackout Equivalent | Status | Implementation Notes |
|---|---|---|---|
| Servers | Matrix Spaces | Native | A Space is a room whose state contains child rooms. Top-level organizational unit. |
| Categories | Sub-spaces (nested spaces) | Native | Spaces can contain child spaces. Render nested spaces as collapsible category headers. |
| Text channels | Rooms within space | Native | Standard `m.room.message` rooms added as space children via `m.space.child` state events. |
| Voice channels | Persistent voice rooms | Partial | Create rooms with a custom `voice_channel` type. Auto-join Jitsi/LiveKit widget on room entry. |
| Stage channels | Broadcast voice rooms | Custom | Room with restricted speak permissions. Use power levels: hosts=50, speakers=25, audience=0. |
| Forum channels | Thread-first rooms | Custom | Room configured to only show thread roots in timeline. Each post = thread starter. |
| Announcement channels | Read-only broadcast rooms | Native | Room with `power_level` for `events.m.room.message` set to 50 (moderator+). |
| Channel reordering | `m.space.child` `order` field | Native | The `order` field controls sort order. Build drag-drop UI. |
| Channel follow | Room alias subscription | Custom | No protocol equivalent. Build a cross-space relay bot that bridges announcements. |
| Server templates | Space snapshot export/import | Custom | Export space structure (rooms, power levels, settings) as JSON. Import to recreate. |
| Welcome screen | Custom onboarding room state | Custom | Store welcome config in space state event. Show modal on first space join. |
| Onboarding flow | Multi-step join wizard | Custom | Sequence of screens: rules acceptance, role selection, interest channels. Store progress in account data. |
| Server discovery | Public space directory | Partial | Synapse room directory supports spaces. Build a curated discovery UI with categories. |
| Vanity URL | Room alias customization | Native | Set canonical alias via `m.room.canonical_alias`. Example: `#my-community:blackout.coop`. |
| Server icon | Space avatar (`m.room.avatar`) | Native | Set via `m.room.avatar` state event. Render in space list sidebar. |
| Server banner | Custom space header image | Custom | Store banner URL in custom state event. Render as header in space overview panel. |
| Invite splash | Custom invite page | Custom | Build invite link handler that shows branded splash with space info before joining. |

### 3.2 Roles & Permissions

| Discord Feature | Blackout Equivalent | Status | Implementation Notes |
|---|---|---|---|
| Role hierarchy | Power levels + custom roles | Partial | Matrix uses numeric power levels (0-100). Map named roles to power level ranges. |
| Role assignment | Power level setting per user | Native | Set via `m.room.power_levels` state event `users` map. Build role picker UI. |
| Role colors | Custom role metadata | Custom | Store role color in custom state event or account data. Render colored name in member list. |
| Role icons | Custom role metadata | Custom | Store role icon URL alongside color in custom role state event. |
| Channel permissions | Per-room power levels | Native | Each room has independent `m.room.power_levels`. Override from space defaults per channel. |
| Per-user overrides | User power level per room | Native | Set specific user power levels in individual rooms. Build permission override UI. |
| Permission calculator | Power level inspector | Custom | Build UI showing effective permissions across power levels and room overrides. |
| Admin permission | Power level 100 | Native | Power level 100 = room admin. Can set other power levels, change room state. |

---

## 4. Feature Mapping: Media, Voice/Video & Screen Sharing

### 4.1 Media & Files

| Discord Feature | Blackout Equivalent | Status | Implementation Notes |
|---|---|---|---|
| File uploads | `m.room.message` (`m.file`) | Native | Upload via content repository (`/_matrix/media`). Send `m.file` msgtype with `mxc://` URI. |
| Image embedding | `m.image` msgtype | Native | Upload image, send `m.image` with thumbnail info. Render inline with lightbox. |
| Video embedding | `m.video` msgtype | Native | Upload video, send `m.video`. Build custom player with controls. Support HLS for large files. |
| Image gallery | Media timeline filter | Custom | Filter room timeline for `m.image` events. Render gallery with lightbox navigation. |
| File previews | Rich link/file preview | Custom | Generate thumbnails for PDFs/docs. Show file size, type icon. Preview in modal. |
| Drag-and-drop upload | Client-side handler | Custom | HTML5 drag-drop. Upload to content repo, send appropriate message type. |
| Clipboard paste | Paste event handler | Custom | Listen for paste events with image data. Upload and send as `m.image`. |
| Voice messages | `m.audio` with voice flag | Native | Record audio, upload, send `m.audio` with `org.matrix.msc3245.voice` info. Render waveform. |

### 4.2 Voice, Video & Streaming

| Discord Feature | Blackout Equivalent | Status | Implementation Notes |
|---|---|---|---|
| Voice calling | VoIP via MatrixRTC/LiveKit | Partial | Matrix supports 1:1 VoIP natively. Use MatrixRTC (MSC3401) + LiveKit SFU for group calls. |
| Video calling | MatrixRTC group calls | Partial | LiveKit SFU handles multi-party video. Element Call reference implementation. |
| Screen sharing | `getDisplayMedia` + LiveKit | Partial | Browser `getDisplayMedia()` captures screen. Route through LiveKit SFU as video track. |
| Go Live streaming | LiveKit broadcast room | Custom | One-to-many stream via LiveKit. Presenter shares screen/camera, viewers receive-only. |
| Media player controls | Custom player UI | Custom | Build play/pause/seek/volume controls for audio and video messages in timeline. |
| Server mute/deafen | VoIP track control | Custom | Admin can force-mute via power levels. Client-side deafen stops incoming audio tracks. |

---

## 5. Feature Mapping: Moderation & Safety

| Discord Feature | Blackout Equivalent | Status | Implementation Notes |
|---|---|---|---|
| Kick | Room kick API | Native | `matrix-js-sdk kick(roomId, userId, reason)`. Requires power level for kick. |
| Ban | Room ban API | Native | `ban(roomId, userId, reason)`. Bans prevent rejoin. Manage via ban list UI. |
| Timeout | Temporary power level drop | Custom | Reduce user power level to -1 (cannot send). Restore after timeout via scheduled job/bot. |
| Audit log | Room state history + bot logs | Partial | State changes are immutable. Build audit viewer for mod actions. Use appservice for richer logging. |
| AutoMod keywords | Keyword filter bot/appservice | Custom | Build Blackout-Mod appservice: regex/keyword scanning on `m.room.message`, auto-redact. |
| AutoMod spam | Rate limit + pattern detection | Custom | Client-side rate limiting + server-side appservice for duplicates/join floods/link spam. |
| Raid protection | Join rate limiting | Custom | Monitor joins via appservice. Auto-enable invite-only if joins exceed threshold. |
| Verification gate | `m.room.join_rules` knock/invite | Native | Set join_rules to knock or invite. Build verification form before approval. |
| Slowmode | Custom rate limit per room | Custom | Track last message timestamp per user/room. Enforce cooldown client + appservice. |
| NSFW toggle | Custom room tag/flag | Custom | Store NSFW flag in room state. Gate content behind age verification/content warning. |
| Content filter | Server-side scanning | Custom | Moderation pipeline: image classification, text toxicity scoring via ML models. |
| Member search/filter | Room member directory | Partial | `matrix-js-sdk getJoinedRoomMembers()`. Build searchable list with role/status filters. |
| Invite tracking | Invite event monitoring | Custom | Track `m.room.member` invite events. Attribute joins to inviters for analytics. |

---

## 6. Feature Mapping: User Interface & Navigation

| Discord Feature | Blackout Equivalent | Status | Implementation Notes |
|---|---|---|---|
| Server list sidebar | Space list panel | Custom | Render joined spaces as icon column (left sidebar). Support drag reorder, folders. |
| Channel list sidebar | Room list within space | Custom | Fetch space children, render categorized channel tree. Collapsible sub-spaces. |
| Member list sidebar | Room members panel | Partial | Toggle right panel showing members grouped by role/power level with status. |
| User panel (bottom-left) | Self-profile panel | Custom | Show avatar, display name, status. Buttons for settings, mute, deafen. |
| User profile popup | Member info card | Custom | Click avatar to show card: avatar, name, roles, About Me, mutual spaces, DM button. |
| User profile modal | Full profile view | Custom | Expanded profile: banner, bio, connections, activity. Uses custom profile state events. |
| Status (online/idle/DND) | Presence API | Native | Matrix presence: online, offline, unavailable. DND = custom status + unavailable. |
| Custom status | Custom status event | Partial | Store custom status text/emoji in `status_msg` or custom account data. |
| Activity status | Rich presence data | Custom | No protocol equivalent. Build via custom events/presence extensions. |
| About Me section | Profile bio field | Custom | Store in profile room or account data. Markdown-rendered bio on profile card. |
| Profile banner | Custom profile media | Custom | Store banner `mxc://` URL in account data. Render on profile modal header. |
| Avatar decorations | Avatar overlay system | Custom | Cosmetic client-side overlays from decoration assets. |
| Quick switcher (Ctrl+K) | Room/command search | Custom | Spotlight-style fuzzy search for rooms, spaces, users, commands. |
| Inbox (mentions) | Notification timeline | Partial | Filter sync highlights. Build unified inbox for mentions/replies. |
| Server folders | Space grouping in sidebar | Custom | Group spaces into collapsible folders. Store folder config in account data. |
| Favorites bar | Pinned rooms | Partial | Use `m.favourite` room tag. Render favorites in dedicated top section. |
| Pin messages | `m.room.pinned_events` | Native | State event containing pinned event IDs. Build pinned messages panel. |
| Bookmark messages | Saved messages collection | Custom | Store bookmarked event IDs in account data. Build bookmark panel with search. |
| Mark as unread | `m.fully_read` marker | Partial | Move read marker back. Render unread in sidebar. Store in room account data. |
| Copy message link | `matrix.to` permalink | Native | Generate `https://matrix.to/#/!room:server/$eventId`. |
| Message search | Server-side search API | Native | `/search` endpoint supports full-text with filters. Build search UI. |
| Jump to message | Event context API | Native | Fetch event context, scroll timeline to target, highlight message. |

---

## 7. Feature Mapping: Notifications, Privacy & Settings

| Discord Feature | Blackout Equivalent | Status | Implementation Notes |
|---|---|---|---|
| Per-channel notifications | Push rules per room | Native | Matrix push rules support room-specific overrides. Build level picker per room. |
| Per-server notifications | Push rules per space | Custom | Apply overrides to all rooms within a space. Batch update on change. |
| @everyone suppression | Push rule for room notifications | Native | Override push rule for `@room` mention. Allow per-room toggle. |
| Mute channel/server | Push rule: `dont_notify` | Native | Set room push-rule action to `dont_notify`; extend across space children. |
| Do Not Disturb | Global push-rule override | Native | Disable notifications globally; set presence to unavailable. |
| Blocked users | `m.ignored_user_list` | Native | Account data event listing ignored users. Client hides blocked-user messages. |
| DM permissions | Direct room join rules | Custom | Settings: everyone, friends only, mutual spaces only, nobody. |
| Friend requests | Custom friend system | Custom | No protocol friend system. Build via custom account data + DM invites. |
| Connected accounts | Third-party identity | Partial | Matrix 3PID for email/phone; extend with custom OAuth (GitHub, etc.). |
| Appearance (theme) | Client theme settings | Custom | Theme engine: dark, light, AMOLED, custom colors. Store in account data. |
| Font scaling | Client display settings | Custom | CSS variable for base font size. Slider in accessibility settings. |
| Chat density | Compact/cozy mode | Custom | Toggle message padding/avatar size. Store in local settings. |
| Keybinds | Keyboard shortcut map | Custom | Configurable keybinds; Ctrl+K search, Ctrl+/ shortcuts panel. |
| Streamer mode | Privacy overlay mode | Custom | Hide sensitive data (invite links, emails, notifications). Quick toggle. |
| Developer mode | Debug tools toggle | Custom | Show event/room/user IDs, raw event viewer, network inspector. |

---

## 8. Technical Architecture

### 8.1 System Overview

Blackout is a custom Matrix client built directly on `matrix-js-sdk`, communicating with a Synapse homeserver. This provides full UI/UX control while leveraging Matrix's decentralized encrypted protocol.

**Core Stack**

- Client Framework: React (or React Native for mobile) with `matrix-js-sdk`.
- Homeserver: Synapse (Python) or Dendrite (Go).
- Voice/Video SFU: LiveKit via MatrixRTC (MSC3401).
- Media Storage: Synapse content repository (`mxc://`) or S3-compatible backend.
- Search: Synapse built-in search or dedicated index (e.g., Elasticsearch via appservice).
- Bot/Automation Layer: Matrix appservice framework.
- Push Notifications: Sygnal for iOS/Android.
- Database: PostgreSQL (Synapse), Redis for session/presence caching.

**Key Architecture Decisions**

- **Spaces as Servers:** Spaces map directly to Discord server hierarchy.
- **Custom Role System:** Add `co.bmc.roles` named roles over Matrix numeric power levels.
- **E2EE by Default:** Megolm (`m.megolm.v1.aes-sha2`) in all rooms, with SSSS + cross-signing.
- **Custom Events for Parity:** Use `co.bmc.*` state events for features absent in core Matrix.

### 8.2 Custom State Events (`co.bmc.*`)

| Event Type | Purpose | Example Schema |
|---|---|---|
| `co.bmc.roles` | Named role definitions | `{ roles: [{ name, powerLevel, color, icon, permissions }] }` |
| `co.bmc.welcome` | Welcome screen config | `{ title, description, channels: [{ roomId, emoji, description }] }` |
| `co.bmc.onboarding` | Join flow configuration | `{ steps: [{ type: rules\|roles\|channels, content }] }` |
| `co.bmc.forum` | Forum channel config | `{ defaultSort, tags: [{ name, color, emoji }], guidelines }` |
| `co.bmc.banner` | Space/profile banner | `{ mxcUrl, blurhash, crop }` |
| `co.bmc.soundboard` | Soundboard clips | `{ clips: [{ name, mxcUrl, emoji, duration }] }` |
| `co.bmc.automod` | AutoMod configuration | `{ keywords: [], spamThreshold, linkWhitelist, actions }` |
| `co.bmc.template` | Space template snapshot | `{ rooms: [], roles: [], settings: {} }` |

### 8.3 Voice/Video Architecture (LiveKit + MatrixRTC)

Discord-equivalent voice channels require persistent, low-latency group AV with screen sharing.

- Signaling: MatrixRTC (MSC3401) events for call membership and SDP.
- Media transport: LiveKit SFU for routing/simulcast/bandwidth estimation.
- Client integration: `livekit-client-sdk-js` in Blackout, authenticated via homeserver-issued JWT.
- Screen share: browser `getDisplayMedia()` as an additional video track through LiveKit.
- Stage channels: LiveKit publisher permissions gated by Blackout power levels.
- Voice activity: speaking indicators rendered on avatars.

Self-host LiveKit near Synapse. Share JWT signing key between Synapse appservice and LiveKit.

### 8.4 Moderation Architecture

**Blackout-Mod** (Matrix appservice):

- Keyword filtering (regex/exact/fuzzy word lists)
- Spam detection (rate, duplicates, join flood)
- Auto actions (redact, warn DM, timeout, kick, ban)
- Audit trail (private admin room + structured events)
- Optional ML content scanning (image/text)
- Raid protection with auto invite-only lock

---

## 9. Implementation Roadmap

Phased rollout prioritizes messaging/emoji, space structure/permissions, and media/voice/video.

### Phase 1: Foundation (Weeks 1–4)

- Room timeline (send/receive/edit/delete)
- Reply + thread support
- Space list sidebar + room tree
- Power level management UI
- Custom role system (`co.bmc.roles`)
- Member list panel
- Emoji picker (unicode)
- Reactions (`m.reaction`)
- Message search
- Pin messages

### Phase 2: Rich Media & Voice (Weeks 5–8)

- File upload (drag-drop + paste)
- Inline image/video rendering
- Voice messages + waveform
- GIF picker (Tenor)
- 1:1 VoIP calls
- Group voice/video (LiveKit)
- Screen sharing
- Voice channel UX

### Phase 3: Community & Governance (Weeks 9–12)

- Custom emoji/sticker packs
- Soundboard system
- Welcome + onboarding
- Forum channels
- Blackout-Mod appservice
- Raid protection
- Timeout system
- Audit log viewer
- Server discovery directory
- Space templates

### Phase 4: Polish & Parity (Weeks 13–16)

- Quick switcher (Ctrl+K)
- Notification depth (room + space + @everyone suppression + DND)
- Theme engine (dark/light/AMOLED + accents)
- Profile system (banner, bio, decorations)
- Bookmark system
- DM permission controls
- Streamer mode
- Developer mode
- Keyboard shortcuts + keybinds
- Accessibility (font scale, density, reduced motion, screen reader labels)
- Stage channels (LiveKit broadcast)

---

## 10. Appendix: Matrix Event Types Reference

### Room Events (Timeline)

| Event Type | Usage |
|---|---|
| `m.room.message` | Text/image/file/audio/video content (`msgtype`-driven rendering). |
| `m.room.redaction` | Message deletion (content removed, shell retained). |
| `m.reaction` | Emoji reactions via `m.annotation` relation. |
| `m.sticker` | Sticker content event. |
| `m.call.invite` | 1:1 VoIP call initiation with SDP offer. |

### State Events (Room Configuration)

| Event Type | Usage |
|---|---|
| `m.room.create` | Immutable room metadata (version, creator, type). |
| `m.room.name` | Human-readable channel name. |
| `m.room.topic` | Channel description/topic. |
| `m.room.avatar` | Room icon (`mxc://`). |
| `m.room.power_levels` | Permission matrix by user/event type. |
| `m.room.join_rules` | Join policy (`public`, `invite`, `knock`, `restricted`). |
| `m.room.member` | Membership state (`join`, `leave`, `invite`, `ban`, `knock`). |
| `m.room.encryption` | E2EE configuration (Megolm). |
| `m.room.pinned_events` | Pinned event ID list. |
| `m.space.child` | Space hierarchy child link + order. |
| `m.space.parent` | Parent space reference. |

### Account Data Events

| Event Type | Usage |
|---|---|
| `m.direct` | DM room mapping by user ID. |
| `m.push_rules` | Notification rules and overrides. |
| `m.ignored_user_list` | Blocked/ignored users. |
| `m.tag` | Room tags (`m.favourite`, `m.lowpriority`, custom). |
| `m.fully_read` | Per-room read marker event ID. |

---

Document prepared for the Black Market Coalition by Blackout development team. All features are designed to maintain end-to-end encryption as a non-negotiable baseline.

## 11. Work Prompts (Execution-Ready)

Use these prompts directly in sprint planning, issue creation, and AI-assisted implementation workflows.

### 11.1 Epic Prompt Template

```text
You are implementing EPIC: <epic_name> for Blackout (Matrix client on matrix-js-sdk + Synapse).

Context:
- Goal: <goal>
- User value: <why_it_matters>
- Dependencies: <deps>
- Constraints: E2EE is non-negotiable, preserve Matrix protocol compatibility.

Deliverables:
1) Technical design note
2) Data/event schema updates (if any)
3) UI/UX implementation
4) Tests (unit + integration)
5) Telemetry and rollout plan

Definition of Done:
- Acceptance criteria are met
- No E2EE regressions
- Permission model is validated
- Feature flag and migration notes are documented
```

### 11.2 Feature Implementation Prompt Template

```text
Implement feature: <feature_name>.

Current status: <Native/Partial/Custom/3rd Party>
Matrix primitives involved: <event_types/APIs>
Custom events involved: <co.bmc.* or none>

Tasks:
- Add/modify client logic
- Build/adjust UI states (loading/empty/error)
- Add permission checks
- Add analytics events
- Add tests
- Add docs

Acceptance Criteria:
- <criterion_1>
- <criterion_2>
- <criterion_3>

Non-Functional:
- p95 interaction latency target: <target>
- Accessibility: keyboard, labels, contrast
- Security: abuse checks and E2EE validation
```

### 11.3 QA Prompt Template

```text
Create a QA test plan for <feature_name> in Blackout.

Include:
1) Happy-path scenarios
2) Permission boundary tests
3) E2EE/device verification interactions
4) Failure/retry paths (offline, reconnect, media upload errors)
5) Large-room performance checks
6) Accessibility checks

Output:
- Test matrix (scenario, steps, expected result)
- Regression checklist
- Release blocking criteria
```

### 11.4 Milestone Prompts

#### Milestone 1 (Weeks 1–4): Messaging Foundation

```text
Generate implementation tickets for Milestone 1 from DISCORD_PARITY_BUILD_PLAN.md.

Scope:
- Room timeline, replies/threads, space list + room tree
- Power level UI + role assignment
- Emoji picker + reactions
- Message search + pinned panel

For each ticket include:
- user story
- technical scope
- dependencies
- acceptance criteria
- test plan
- estimate (S/M/L/XL)
```

#### Milestone 2 (Weeks 5–8): Rich Media & Voice

```text
Produce a delivery plan for Milestone 2.

Scope:
- File upload (drag-drop/paste)
- Media rendering + waveform voice messages
- GIF picker integration
- 1:1 VoIP and group voice/video via LiveKit + MatrixRTC
- Screen share and persistent voice channel UX

Output:
- architecture tasks
- frontend tasks
- backend/appservice tasks
- risk register with mitigations
- phased rollout sequence
```

#### Milestone 3 (Weeks 9–12): Governance & Safety

```text
Create an implementation plan for Milestone 3.

Scope:
- Custom emoji/sticker packs
- Soundboard
- Welcome/onboarding
- Forum channels
- Blackout-Mod appservice (keywords/spam/raid/timeout/audit)
- Discovery directory + templates

Output:
- schema definitions
- moderation policy defaults
- admin UI requirements
- observability and auditing requirements
```

#### Milestone 4 (Weeks 13–16): Polish & Parity

```text
Design execution tickets for Milestone 4.

Scope:
- Ctrl+K quick switcher
- notification depth and DND
- theme engine + profile system + bookmarks
- DM permissions + streamer mode + developer mode
- keybinds + accessibility + stage channels

Output:
- prioritized backlog
- dependency graph
- release gating checklist
```

### 11.5 Specialized Prompts by Workstream

#### Messaging/Composer

```text
Implement message scheduling in Blackout as a client-side scheduled send queue.

Requirements:
- schedule/edit/cancel queued messages
- persistence across reloads
- retry policy for transient failures
- clear UX state before/after send
- encrypted-room compatibility

Provide:
- data model
- queue processor design
- UI state diagram
- tests
```

#### Roles/Permissions

```text
Implement effective permission inspector for Matrix power levels + custom roles.

Requirements:
- compute effective permissions per user per room
- include room overrides and user overrides
- explain why permission is granted/denied
- admin-safe editing workflow with preview diff

Provide:
- algorithm
- UI design
- validation tests
```

#### Voice/Video

```text
Implement persistent voice channels using MatrixRTC signaling and LiveKit media.

Requirements:
- one-click join/leave
- speaking indicators
- reconnect handling
- force mute/deafen controls by moderators
- stage-channel speaker permissions

Provide:
- signaling flow
- token/auth model
- error handling plan
- load/perf test plan
```

#### Moderation

```text
Build Blackout-Mod appservice v1.

Requirements:
- keyword + regex filtering
- spam and join-flood detection
- actions: redact, warn, timeout, kick, ban
- audit log events in admin room
- configurable per-space policy

Provide:
- service architecture
- event schemas
- policy config format
- operator runbook
```

#### Search/Discovery

```text
Implement server discovery for Matrix spaces.

Requirements:
- category browsing
- ranking signals (activity, safety, growth)
- moderation/trust badges
- join funnel with invite splash

Provide:
- API/query design
- ranking strategy
- anti-abuse safeguards
- analytics plan
```

### 11.6 Program Management Prompt

```text
Act as technical program manager for the Blackout Discord-parity roadmap.

Using DISCORD_PARITY_BUILD_PLAN.md:
- build a week-by-week execution calendar (Weeks 1–16)
- assign stream ownership
- identify critical path dependencies
- define success metrics per milestone
- define go/no-go criteria per release

Output:
- roadmap table
- RAID log
- staffing assumptions
- weekly status template
```

### 11.7 “Definition of Complete Build Plan” Checklist Prompt

```text
Validate whether DISCORD_PARITY_BUILD_PLAN.md is complete and execution-ready.

Check:
1) every mapped feature has owner + status + acceptance criteria
2) every custom event has schema + migration/versioning notes
3) every milestone has scoped deliverables + dependencies
4) security/E2EE/privacy requirements are explicit
5) QA and release gates are defined
6) observability and rollback plans are included

Return:
- PASS/FAIL by section
- exact gaps
- recommended edits
```

These prompts are intended to operationalize the full build plan into executable engineering work without additional framing.
