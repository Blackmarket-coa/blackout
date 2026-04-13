# Frontend Consolidation Parity Matrix

Source reference: `docs/architecture/frontend-consolidation-work-doc-ai-prompts.md`.
Canonical baseline for gap checks: `apps/blackout-client`.

| feature_id | source_surface | route_or_entry | family | status_seed | notes |
|---|---|---|---|---|---|
| core.auth.login | apps/blackout-client | `/login/:server?/` | Auth/session/recovery/security flows | kept | Canonical auth route in router. |
| core.auth.register | apps/blackout-client | `/register/:server?/` | Auth/session/recovery/security flows | kept | Canonical registration route. |
| core.auth.reset_password | apps/blackout-client | `/reset-password/:server?/` | Auth/session/recovery/security flows | kept | Canonical reset flow route. |
| core.chat.home | apps/blackout-client | `/home/` (+ create/join/search/deep-dive/room subroutes) | Core Matrix chat + room UX | kept | Main chat shell and room timeline routing. |
| core.chat.direct | apps/blackout-client | `/direct/` (+ create/room subroutes) | Core Matrix chat + room UX | kept | DM entrypoint and room flow. |
| core.chat.space | apps/blackout-client | `/:spaceIdOrAlias/` (+ lobby/search/room subroutes) | Core Matrix chat + room UX | kept | Space hierarchy and room navigation. |
| core.chat.explore | apps/blackout-client | `/explore/` (+ featured/server) | Core Matrix chat + room UX | kept | Public room discovery and featured listings. |
| core.inbox | apps/blackout-client | `/inbox/notifications/`, `/inbox/invites/` | Notifications and presence behaviors | kept | Notifications and invite inbox surfaces. |
| core.create.space | apps/blackout-client | `/create` | Core Matrix chat + room UX | kept | Create space flow route. |
| nav.home | apps/blackout-client | Sidebar: Home tab | Core Matrix chat + room UX | kept | Global nav entry. |
| nav.direct | apps/blackout-client | Sidebar: Direct tab | Core Matrix chat + room UX | kept | Global nav entry. |
| nav.explore | apps/blackout-client | Sidebar: Explore tab | Core Matrix chat + room UX | kept | Global nav entry. |
| nav.create | apps/blackout-client | Sidebar: Create tab | Core Matrix chat + room UX | kept | Global nav entry. |
| nav.search | apps/blackout-client | Sidebar: Search tab | Core Matrix chat + room UX | kept | Global nav utility entry. |
| nav.inbox | apps/blackout-client | Sidebar: Inbox tab | Notifications and presence behaviors | kept | Global nav entry for inbox. |
| nav.settings | apps/blackout-client | Sidebar: Settings tab | Settings and capability-gated administration surfaces | kept | Entry to settings page. |
| feature.governance.routes | apps/blackout-client | `/governance`, `/governance/new` | Governance | kept | Registry-backed feature routes. |
| feature.governance.nav | apps/blackout-client | Feature nav: Governance | Governance | kept | Feature manifest nav item. |
| feature.forum.routes | apps/blackout-client | `/forum` | Forum | kept | Registry-backed forum route. |
| feature.forum.nav | apps/blackout-client | Feature nav: Forum | Forum | kept | Feature manifest nav item. |
| feature.deaddrop.routes | apps/blackout-client | `/deaddrop` | Dead-drop | kept | Registry-backed dead-drop route. |
| feature.deaddrop.nav | apps/blackout-client | Feature nav: Dead Drop | Dead-drop | kept | Feature manifest nav item. |
| feature.deaddrop.settings | apps/blackout-client | Settings section: Dead Drop | Dead-drop | kept | Feature-contributed settings section. |
| feature.moderation.routes | apps/blackout-client | `/moderation/draupnir` | Moderation | kept | Registry-backed moderation route. |
| feature.moderation.nav | apps/blackout-client | Feature nav: Moderation | Moderation | kept | Feature manifest nav item. |
| settings.account | apps/blackout-client | Settings section: Account | Settings and capability-gated administration surfaces | kept | SettingsPage section. |
| settings.appearance | apps/blackout-client | Settings section: Appearance | Settings and capability-gated administration surfaces | kept | SettingsPage section. |
| settings.notifications | apps/blackout-client | Settings section: Notifications | Notifications and presence behaviors | kept | SettingsPage section. |
| settings.privacy | apps/blackout-client | Settings section: Privacy | Auth/session/recovery/security flows | kept | Includes DM controls and blocked users. |
| settings.voice_video | apps/blackout-client | Settings section: Voice & Video | Media upload/viewer/camera/share/deeplink flows | kept | Device/media interaction settings. |
| settings.accessibility | apps/blackout-client | Settings section: Accessibility | Settings and capability-gated administration surfaces | kept | UX accessibility controls. |
| settings.keybinds | apps/blackout-client | Settings section: Keybinds | Settings and capability-gated administration surfaces | kept | Keyboard controls. |
| settings.developer | apps/blackout-client | Settings section: Developer | Settings and capability-gated administration surfaces | kept | Developer diagnostics controls. |
| settings.about | apps/blackout-client | Settings section: About | Settings and capability-gated administration surfaces | kept | Version/support info. |
| cap.moderation.dashboard | apps/blackout-client | ClientLayout gated moderation dashboard | Moderation | kept | Gated by `hasModeratorAccess` power-level check. |
| cap.feature.capabilities | apps/blackout-client | Feature manifest capabilities (`governance.*`, `forum.*`, `deaddrop.*`, `moderation.*`) | Settings and capability-gated administration surfaces | kept | Capability declarations exist per feature manifest. |
| media.steg.decode | apps/blackout-client | Steganography decoder component | Steganography | kept | Decode surface exists; dedicated nav/route not explicit. |
| media.upload_pipeline | apps/blackout-client | Room composer + media handling in room UX | Media upload/viewer/camera/share/deeplink flows | kept | Covered in core room UX (non-manifested route). |
| web.workspace.tabs | apps/blackout-web | Workspace panel views: `chat|dms|activity|calls|files|repo-tools|discover` | Core Matrix chat + room UX | ported_candidate | Surface exists in migration shell state model. |
| web.mobile.tabs | apps/blackout-web | Mobile tab bar: `home|spaces|search|governance|profile` | Core Matrix chat + room UX | ported_candidate | Parallel mobile-first nav model. |
| web.sidebar.nav | apps/blackout-web | Server sidebar: Home/Rooms/DMs/Activity/Calls/Files/Admin/Create | Core Matrix chat + room UX | ported_candidate | Alternate nav taxonomy vs canonical shell. |
| web.settings.pages | apps/blackout-web | Settings views: `workspace|appearance|monetization|mobile|operations` | Settings and capability-gated administration surfaces | ported_candidate | Different settings IA than client. |
| web.rightpanel.governance | apps/blackout-web | Right panel governance tabs `active|past|create|my-votes|results` | Governance | ported_candidate | Governance panel model exceeds current client routing granularity. |
| web.panel.federation | apps/blackout-web | Federation panel tabs (`health` etc.) | Moderation | ported_candidate | Admin/federation ops panel not explicit in client nav. |
| web.panel.platform_ops | apps/blackout-web | Platform ops panel tabs | Settings and capability-gated administration surfaces | ported_candidate | Operations console surface. |
| web.panel.revenue_ops | apps/blackout-web | Revenue ops tabset | Governance | ported_candidate | Governance-adjacent treasury/ops tooling. |
| web.panel.townhall | apps/blackout-web | Townhall panel modes | Governance | ported_candidate | Governance meeting workflow surface. |
| web.cap.admin_entry | apps/blackout-web | `showAdminEntry` sidebar gate | Settings and capability-gated administration surfaces | ported_candidate | Capability-gated admin visibility. |
| web.feature.entrypoints | apps/blackout-web | `FEATURE_UI_ENTRIES` (settings toggles/composer actions/room actions/widgets/admin) | Settings and capability-gated administration surfaces | ported_candidate | Rich feature-gate inventory seed (includes forum/deaddrop/stego/moderation/governance/media/presence). |
| web.feature.stego_toolkit | apps/blackout-web | `stego_toolkit` + ephemeral stego entrypoints | Steganography | ported_candidate | Explicit steganography toggles/actions. |
| web.feature.media_pipeline | apps/blackout-web | `media_pipeline`, `media_spoilers`, `media_link_previews` | Media upload/viewer/camera/share/deeplink flows | ported_candidate | Explicit media feature surfaces. |
| web.feature.auth_oidc | apps/blackout-web | `oidc_delegated_auth`, homeserver discovery toggles | Auth/session/recovery/security flows | ported_candidate | Auth/security controls surfaced as feature toggles. |
| web.feature.notifications_presence | apps/blackout-web | Presence digest + notification policy settings | Notifications and presence behaviors | ported_candidate | Presence/notification feature controls. |
| gov.shell.root | apps/blackout-gov | Governance shell root (single-page mount) | Governance | duplicate_candidate | Standalone governance surface overlaps client governance feature. |
| gov.proposal_creation | apps/blackout-gov | Proposal creation card | Governance | duplicate_candidate | Dedicated proposal authoring panel. |
| gov.voting_interface | apps/blackout-gov | Voting interface card | Governance | duplicate_candidate | Approve/block/abstain controls. |
| gov.meeting_scheduler | apps/blackout-gov | Meeting scheduler card | Governance | ported_candidate | Not explicit in current client governance routes. |
| gov.treasury_ops | apps/blackout-gov | P2 operations/treasury snapshot card | Governance | ported_candidate | Treasury analytics panel likely missing in canonical client. |
| gov.capability_list | apps/blackout-gov | Capabilities list: proposal creation/voting/delegation+treasury | Governance | duplicate_candidate | Capability summary overlaps governance family baseline. |
| legacy.web.placeholder | apps/web | Placeholder module export only (`export {}`) | Core Matrix chat + room UX | gap | No active routes/nav/settings surfaced in this shell. |
| port.blackout.route.governance | _port | `/blackout/governance` | Governance | duplicate_candidate | Module navigation route in legacy surface. |
| port.blackout.route.education | _port | `/blackout/education` | Forum | ported_candidate | Education module route; no direct counterpart in client manifests. |
| port.blackout.route.mutual_aid | _port | `/blackout/mutual-aid` | Dead-drop | ported_candidate | Mutual-aid route; likely adjacent to deaddrop/community flows. |
| port.nav.leftpanel.explore | _port | Left panel Explore button (`ViewRoomDirectory`) | Core Matrix chat + room UX | duplicate_candidate | Explore nav equivalent exists in client. |
| port.nav.leftpanel.dialpad | _port | Left panel dial pad action | Media upload/viewer/camera/share/deeplink flows | ported_candidate | PSTN/dial pad entry not visible in client sidebar. |
| port.settings.account | _port | Settings tab: Account | Settings and capability-gated administration surfaces | duplicate_candidate | Legacy equivalent of client account settings. |
| port.settings.sessions | _port | Settings tab: Sessions | Auth/session/recovery/security flows | duplicate_candidate | Session manager parity with client account/device flows. |
| port.settings.appearance | _port | Settings tab: Appearance | Settings and capability-gated administration surfaces | duplicate_candidate | Legacy equivalent of client appearance settings. |
| port.settings.notifications | _port | Settings tab: Notifications | Notifications and presence behaviors | duplicate_candidate | Legacy equivalent of client notifications settings. |
| port.settings.preferences | _port | Settings tab: Preferences | Settings and capability-gated administration surfaces | ported_candidate | Broader prefs tab not one-to-one in client. |
| port.settings.keyboard | _port | Settings tab: Keyboard | Settings and capability-gated administration surfaces | duplicate_candidate | Equivalent to keybind settings. |
| port.settings.sidebar | _port | Settings tab: Sidebar | Settings and capability-gated administration surfaces | ported_candidate | Sidebar-specific controls not explicit in client settings taxonomy. |
| port.settings.voice | _port | Settings tab: Voice | Media upload/viewer/camera/share/deeplink flows | duplicate_candidate | Equivalent to voice/video settings. |
| port.settings.security | _port | Settings tab: Security | Auth/session/recovery/security flows | duplicate_candidate | Equivalent to security controls in privacy/account/device surfaces. |
| port.settings.encryption | _port | Settings tab: Encryption | Auth/session/recovery/security flows | duplicate_candidate | Encryption management flow; partly implicit in client recovery flows. |
| port.settings.steganography | _port | Settings tab: Steganography | Steganography | gap | Dedicated stego settings tab absent in client settings sections. |
| port.settings.labs | _port | Settings tab: Labs (gate: `show_labs_settings`) | Settings and capability-gated administration surfaces | ported_candidate | Capability/labs tab explicit in legacy; implicit in client via dev settings only. |
| port.settings.mjolnir | _port | Settings tab: Mjolnir (gate: `mjolnirEnabled`) | Moderation | ported_candidate | Dedicated Mjolnir admin tab not explicit in client settings. |
| port.settings.help | _port | Settings tab: Help/About | Settings and capability-gated administration surfaces | duplicate_candidate | Equivalent to client About settings. |
| legacy.config.labs_gate | legacy/element | `show_labs_settings` config flag (app=false, develop=true) | Settings and capability-gated administration surfaces | ported_candidate | Clear capability gate signal from element-era configs. |
| legacy.config.threads_activity | legacy/element | `features.threadsActivityCentre` (develop config) | Core Matrix chat + room UX | ported_candidate | Thread activity centre capability from legacy config. |
| legacy.config.video_rooms | legacy/element | `features.feature_video_rooms` | Media upload/viewer/camera/share/deeplink flows | duplicate_candidate | Video-room capability appears in legacy configs. |
| legacy.config.group_calls | legacy/element | `features.feature_group_calls` | Media upload/viewer/camera/share/deeplink flows | duplicate_candidate | Group-call capability appears in legacy configs. |
| legacy.config.element_call | legacy/element | `element_call.url` | Media upload/viewer/camera/share/deeplink flows | ported_candidate | External call integration endpoint defined in configs. |

## Duplicates vs `apps/blackout-client` (obvious)

- **Governance:** `apps/blackout-gov` proposal/voting shell and `_port` `/blackout/governance` duplicate canonical governance intent already represented by client governance routes.
- **Core nav/chat:** `_port` left-panel explore and major chat navigation patterns overlap canonical Home/Direct/Explore/Inbox shell.
- **Settings basics:** `_port` Account/Appearance/Notifications/Keyboard/Help broadly duplicate existing client settings sections.
- **Media/calls baseline:** legacy `feature_video_rooms` / `feature_group_calls` map to existing voice-video/media direction in client.

## Obvious gaps against `apps/blackout-client`

- **No active `apps/web` surface:** legacy browser shell is effectively empty placeholder.
- **Steganography settings UX:** `_port` has explicit steganography settings tab; canonical client currently has stego utilities but no dedicated settings section/tab.
- **Advanced moderation admin surfaces:** `_port` has explicit Mjolnir settings tab; client has moderation route/nav but no equivalent dedicated settings tab.
- **Labs/experiments controls:** `_port` + `legacy/element` expose explicit labs gating; client has developer settings but no explicit labs parity surface.
- **Governance operations depth:** `apps/blackout-gov` and `apps/blackout-web` include meeting scheduler/treasury/ops style governance panels not obviously present in client governance routes.
- **Dial pad/PSTN affordance:** `_port` left panel exposes dial-pad action; not evident in client shell nav.
