# Discord-Parity Build Plan for Blackout

## Purpose

This plan turns the provided Discord-parity blueprint into a **delivery plan focused on features that are still missing or not production-ready** in Blackout.

It does three things:

1. Normalizes naming differences (Discord wording vs Matrix wording vs existing Blackout names).
2. Defines a repeatable gap-assessment method so we do not rebuild what already exists under another name.
3. Prioritizes execution by user impact, technical dependency, and security risk (E2EE-first).

---

## 1) Normalized feature taxonomy (to avoid duplicate work)

Use this canonical naming map in tickets, acceptance criteria, and release notes.

| Canonical Capability | Discord Term | Matrix/Protocol Term | Existing Blackout/Repo Signals | Action |
|---|---|---|---|---|
| Server container | Server | Space (`m.space.child`, `m.space.parent`) | Space-aware room list + migration docs | Keep “Space (Server)” wording in UI |
| Channel permissions | Channel overrides | `m.room.power_levels` per room | Existing room roles/permissions UI path | Add explicit “Effective permissions” view |
| Reactions | Reactions | `m.reaction` | Event support and tests are present | Treat as GA, focus polish/scale |
| Pinned messages | Pins | `m.room.pinned_events` | Existing event handling + settings labels | Close UX gaps (pin panel discoverability) |
| Threads | Threads | `m.thread` relations | Thread timeline structures present | Validate parity UX and inbox behavior |
| Read/unread markers | Mark unread | `m.fully_read` + receipt state | Read marker support present | Add explicit “mark unread” affordance |
| Voice/video group calls | Voice channels / Go Live | MatrixRTC + SFU (LiveKit) | MatrixRTC references exist | Build persistent voice-channel UX |
| Custom community metadata | Roles, onboarding, banner, automod config | Custom state (`co.bmc.*`) | Legacy custom namespace mostly `im.blackout.*` | Standardize namespace migration plan |

---

## 2) Gap-assessment workflow (Week 0, mandatory)

Before implementation, run a structured audit per feature:

1. **Protocol support check**: Native Matrix vs custom needed.
2. **Client support check**: SDK support exists but UI missing?
3. **Discoverability check**: Feature exists but hidden/unclear?
4. **Scale/resilience check**: Works in small rooms but fails in large spaces?
5. **Security check**: E2EE impact, metadata leakage, permission bypass risk.

### Definition of status

- **Implemented**: End-to-end behavior works with tests and UX entry points.
- **Partial**: Core event/API exists but UX and/or admin controls are incomplete.
- **Missing**: No usable implementation.
- **Rename/Unify**: Function exists under old naming and needs standardization.

---

## 3) Prioritized missing-feature backlog

> Priority is based on user-visible value and dependency ordering.

## P0 — Core social/chat parity (ship first)

### P0.1 Emoji and sticker ecosystem

- Unicode picker parity (search, recents, skin tones, shortcode autocomplete).
- Custom emoji and sticker packs with admin management and permission controls.
- Animated emoji gating and reduced-motion compliance.

**Why now:** Messaging delight + social identity; low protocol risk, high daily usage.

**Acceptance criteria**

- Picker opens <150ms on warm cache.
- `:shortcode:` autocomplete resolves in composer and slash-style context.
- Custom packs can be scoped at space or room level.
- Permission checks block unauthorized pack edits.

### P0.2 Mentions and inbox parity

- Role mentions (`@role`) via custom role membership resolution.
- Channel mentions (`#channel`) with space-aware autocomplete.
- Unified inbox for mentions/replies/threads with jump-to-context.

**Why now:** Navigation and attention management are core Discord expectations.

### P0.3 Message productivity

- Scheduled send queue (local + optional server-assisted retry).
- Bookmark/saved messages with searchable panel.
- Quick switcher (`Ctrl+K`) for rooms/users/commands.

**Why now:** High daily workflow impact, moderate implementation complexity.

---

## P1 — Space governance and moderation

### P1.1 Role system completion

- Named roles with color/icon/permission metadata.
- Effective-permission inspector (room overrides + user overrides).
- Safer role editing with preview and diff before apply.

### P1.2 Onboarding and discovery

- Welcome screen + multi-step onboarding (`rules`, `role`, `channel opt-in`).
- Server discovery UX with category curation and trust labels.
- Invite splash with pre-join context and safety signals.

### P1.3 Moderation automation (Blackout-Mod)

- Keyword/regex filters, anti-spam heuristics, raid protection.
- Timeout flow (temporary power-level restriction + auto restore).
- Auditable enforcement log (immutable admin room + UI viewer).

**Why now:** Required for community growth and abuse resistance.

---

## P2 — Voice/video and rich media parity

### P2.1 Persistent voice channel UX

- Room types for voice channels.
- One-click auto-join voice session on channel entry.
- Speaking indicators, server mute/deafen, stage-like role gating.

### P2.2 Group video + screen sharing hardening

- LiveKit integration completion: auth token flow, reconnect behavior, metrics.
- Screen share quality profiles (FPS/bitrate presets).
- Viewer-centric controls for Go Live-style broadcast mode.

### P2.3 Media experience

- Gallery view for room media.
- Rich file preview cards (PDF/docs thumbnails where possible).
- Soundboard clip UX and governance (who can upload/play).

---

## P3 — Settings, privacy, and polish

- Per-space notification presets with room-level override explainers.
- DM permission matrix (everyone / mutual spaces / approved contacts).
- Theme engine + density + font scaling + reduced motion.
- Streamer mode and developer mode refinement.

---

## 4) Cross-cutting technical tracks

### Track A — Custom event namespace migration

Current code and docs include legacy `im.blackout.*` event names and planned `co.bmc.*` extensions.

**Plan**

1. Introduce canonical event registry with dual-read, single-write policy.
2. Emit new writes as `co.bmc.*` while still reading legacy events.
3. Add migration utility for existing room/account data.
4. Decommission legacy write paths after telemetry confirms adoption.

### Track B — E2EE and security invariants

Every feature ticket must include:

- Encryption behavior impact statement.
- Metadata exposure review (especially moderation/search/indexing).
- Abuse-case checklist (mention spam, emoji/sticker abuse, invite abuse, media abuse).

### Track C — Performance and scale

Set SLOs now to avoid late regressions:

- Room switch to first meaningful message: p95 < 900ms on warm sync.
- Typing/composer latency: p95 < 50ms local interaction.
- Reaction aggregation render: < 16ms for typical message tile updates.
- Member list virtualized for large rooms (10k+ members).

---

## 5) Milestone timeline (16-week execution)

## Milestone 0 (Week 0): Gap validation and sequencing

- Complete canonical feature inventory with one owner per feature.
- Mark each feature: Implemented / Partial / Missing / Rename-Unify.
- Freeze MVP scope for Milestones 1–2.

## Milestone 1 (Weeks 1–4): Messaging parity baseline

- Emoji picker + custom emoji/sticker framework.
- Mentions improvements (`@role`, `#channel`) + inbox baseline.
- Quick switcher and bookmarks MVP.

## Milestone 2 (Weeks 5–8): Governance and moderation baseline

- Named role metadata + permission inspector.
- Welcome/onboarding flow.
- Blackout-Mod v1 (keyword, spam, timeout, audit log).

## Milestone 3 (Weeks 9–12): Voice/media parity

- Persistent voice room UX + stage controls.
- Group video + screen share hardening.
- Gallery + media preview + soundboard moderation controls.

## Milestone 4 (Weeks 13–16): Privacy/settings/polish

- Notifications depth, DM permissions, appearance/accessibility.
- Streamer/developer mode improvements.
- Stability hardening and parity bug burn-down.

---

## 6) Delivery model and ownership

Create 6 parallel streams with weekly integration points:

1. **Messaging UX stream**
2. **Space & roles stream**
3. **Moderation appservice stream**
4. **Voice/video infra stream**
5. **Settings/privacy stream**
6. **Platform quality stream** (perf, tests, telemetry)

Each stream tracks:

- PRD + technical design docs.
- Security checklist completion.
- Telemetry and success metrics.
- Rollout plan (alpha → beta → general availability).

---

## 7) Release gates (must pass before GA)

- No regressions in E2EE message send/receive/edit/delete.
- Moderator actions are fully auditable.
- Voice/video reconnect and failover behavior validated under packet loss.
- Accessibility checks pass for new UI (keyboard nav, labels, contrast).
- All new custom event schemas versioned and documented.

---

## 8) Immediate next actions (next 7 days)

1. Create a parity board with one ticket per canonical capability.
2. Run Week-0 feature audit and populate status labels.
3. Finalize namespace migration RFC (`im.blackout.*` → `co.bmc.*`).
4. Start Milestone 1 implementation with two pilot epics:
   - Emoji/sticker system
   - Mentions/inbox/switcher flow

This yields visible user value quickly while de-risking deeper governance and real-time media work.
