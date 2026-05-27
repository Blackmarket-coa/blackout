# Discord parity blueprint for Blackout (Matrix-first)

> **Status update (2026-05-27).** This is a paradigm/mapping reference, not a status report. Many
> items below are now shipped (voice/video, forum channels, roles, moderation, onboarding). For the
> code-verified parity matrix and gap list, see
> [`../audits/discord-comparative-analysis-2026-05-27.md`](../audits/discord-comparative-analysis-2026-05-27.md).

## Executive summary

This blueprint outlines how Blackout can replicate Discord-style UX while preserving Matrix interoperability and end-to-end encryption as strict defaults.

- **Platform baseline:** `matrix-js-sdk` client on Synapse with E2EE always on.
- **Strategy:** use native Matrix events where possible; layer custom `co.bmc.*` state/events for gaps.
- **Status legend:**
  - **Native**: supported in Matrix protocol.
  - **Partial**: protocol exists, Blackout UI/polish still needed.
  - **Custom**: Blackout-specific implementation required.
  - **Needs Build**: large implementation investment.
  - **3rd Party**: external service dependency.

## 1) Messaging and emoji parity map

| Discord feature | Blackout equivalent | Status | Notes |
|---|---|---|---|
| Text channels | Matrix rooms (`m.room.message`) | Native | Model channel types via room metadata. |
| DMs / Group DMs | Direct/private rooms | Native | Use `is_direct` + invite-only private rooms. |
| Threads | `m.thread` relation | Native | Sidebar thread panel + root/reply context. |
| Replies | `m.in_reply_to` | Native | Render quoted parent event. |
| Mentions (`@user`) | Matrix user pills | Native | Autocomplete from room members. |
| Role mentions | Custom role expansion | Custom | Resolve custom role state to user list. |
| Channel mentions | Room pills (`matrix.to`) | Partial | Build `#channel` autocomplete from space children. |
| Slash commands | Client parser / bot dispatch | Custom | Local command routing + bot integration. |
| Edit / delete | `m.replace`, redaction | Native | Show edited/deleted placeholders. |
| Markdown / code / spoiler | `formatted_body` HTML | Native | Markdown parser + syntax highlighting + spoiler reveal. |
| Scheduled send | Local queue | Custom | Client-side timer queue + retry handling. |
| Reactions | `m.reaction` | Native | Aggregate reaction bar per event. |
| Emoji picker | Custom picker | Custom | Search, skin tones, recents, autocomplete. |
| Custom emoji/stickers | MSC2545 packs | Partial/Custom | Space-managed pack lifecycle. |
| GIF picker | Tenor/Giphy | 3rd Party | Send as `m.image` gif. |

## 2) Spaces/servers and permissions parity map

- **Servers → Spaces** (native).
- **Categories → nested spaces** (native).
- **Announcements → power-level controlled broadcast rooms** (native).
- **Forum/Stage/Welcome/Onboarding/Templates** require **custom** `co.bmc.*` state and Blackout UX.
- **Role system:** map named roles to Matrix power levels with custom metadata (`name`, `color`, `icon`, policy flags).

## 3) Media and voice/video parity map

- **Files/images/video/audio/voice messages:** Matrix-native message types.
- **Group voice/video/screen share:** MatrixRTC + LiveKit SFU (partial, heavy integration).
- **Go Live / Stage UX:** custom permission + moderation surfaces over SFU stack.

## 4) Moderation and safety parity map

- **Kick/ban/redaction:** native room moderation.
- **Timeout/slowmode/raid protection/AutoMod:** custom appservice + policy engine.
- **Audit logs:** combine state/event history with moderator action stream.

## 5) UI/navigation parity map

- Discord-like shell (space rail, channel tree, member list, quick switcher, inbox) is mostly **client UX work** over native Matrix data.
- Advanced profile/appearance/activity systems remain **custom** and should use account data + namespaced state events.

## 6) Notifications/privacy/settings parity map

- **Per-room notifications, mute, DND, ignored users:** Matrix-native push/account-data controls.
- **Per-space policy, DM permissions, streamer mode, keybind maps, advanced theming:** custom client governance/settings layer.

## 7) Architecture reference

### Core stack

- Client: Blackout web client on `matrix-js-sdk`
- Homeserver: Synapse
- E2EE: Megolm + cross-signing + SSSS
- Group RTC: LiveKit + MatrixRTC signaling
- Automation: appservice layer (AutoMod, relay, policy bots)

### Custom state namespace

Recommended custom events:

- `co.bmc.roles`
- `co.bmc.welcome`
- `co.bmc.onboarding`
- `co.bmc.forum`
- `co.bmc.banner`
- `co.bmc.soundboard`
- `co.bmc.automod`
- `co.bmc.template`

## 8) Phased roadmap

1. **Foundation (Weeks 1-4):** core messaging, threads/replies, spaces/channel tree, power levels, reactions, search.
2. **Rich media + voice (Weeks 5-8):** uploads/media UX, voice messages, GIFs, 1:1 and group RTC baseline.
3. **Community + governance (Weeks 9-12):** custom emoji/sticker packs, onboarding/welcome, AutoMod, raid protection, audit tools.
4. **Polish + parity (Weeks 13-16):** quick switcher, advanced notification controls, profiles, themes, accessibility, stage channels.

## 9) Matrix event quick reference

- **Timeline:** `m.room.message`, `m.reaction`, `m.sticker`, `m.room.redaction`, call events.
- **State:** `m.room.name`, `m.room.topic`, `m.room.avatar`, `m.room.power_levels`, `m.room.join_rules`, `m.room.encryption`, `m.room.pinned_events`, `m.space.child`.
- **Account data:** `m.direct`, `m.push_rules`, `m.ignored_user_list`, `m.tag`, `m.fully_read`.

---

This blueprint is intended to be used with:

- `docs/features/feature_registry.json` (machine-readable tracking),
- `docs/operations/runbooks/feature-preset-rollout-and-rollback.md` (rollout + rollback operations),
- `apps/blackout-web/src/settings/feature-presets.ts` (runtime preset policies).
