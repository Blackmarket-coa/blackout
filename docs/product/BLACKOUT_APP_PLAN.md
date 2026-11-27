# Blackout app plan: participation, contribution, and simple navigation

**Updated:** November 20, 2026
**Status:** Product direction and implementation plan. This documentation update does not implement or establish production availability of the proposed experience.
**Source baseline:** `3c2e72fc2b63d417a63ddfad26554282f0c3a66c` on `develop`. Evidence below describes reviewed source, not runtime verification.
**Companions:** [Agency, community, character, and creator growth](BLACKOUT_AGENCY_COMMUNITY_CHARACTER_AND_CREATOR_GROWTH.md) · [Whole-product MVP](../BLACKOUT_WHOLE_PRODUCT_MVP.md) · [Participation strategy](../BLACKOUT_HABIT_AND_PARTICIPATION_STRATEGY.md) · [Circle/Reach contract](../features/circle-reach-feed.md) · [Mobile build guide](../../mobile-application-build-guide.md)

## 1. Product promise and scope

**Creator-economy update:** [Products, participation surfaces, and wiring requirements](BLACKOUT_CREATOR_ECONOMY.md) removes AI personas from sale, records the monetization catalogue, defines contextual creation prompts, and tracks production delivery blockers. Use it with this navigation plan.

Blackout is an everyday social app for discovering, expressing, connecting, competing, learning, organizing, and earning. It brings together the everyday activities people associate with X, Substack, TikTok, Instagram, Snapchat, and Facebook through one identity, community network, and coherent interface. These are product ambitions; complete replacement of each service is not a launch claim.

People build standing through meaningful contribution and outcomes. Audience participation is a first-class activity: connecting someone with useful information, asking a good question, supporting a team, or completing a community task can matter without an existing audience. People reached is an impact measure; follower count is not the status ladder.

Coalition supplies community discovery, coordination, and gameplay linked to shared and real-world activity. Coliseum supplies live culture, debates, structured competition, and asynchronous participation. Creator tools help people turn attention into sustainable creative activity and community outcomes, including appropriate FBM offerings.

The repeatable journey is **discover → participate → see the result → build your character and community**. Watching, reading, enjoying entertainment, and belonging remain valid ways to start. A user need not become a creator or compete to use Blackout comfortably.

This plan owns the target app information architecture. Where older documents prescribe conflicting global or nested tab arrangements, use this plan. Preserve the existing Circle/Reach feed contract, permissions, ecosystem ownership, and release gates; navigation simplification does not silently change those contracts.

## 2. Stable main navigation

| Bottom destination | Primary job and default surface | Contextual capabilities |
| --- | --- | --- |
| Home | Read and watch the Circle/Reach feed | Discover, search, format filters, posts, photos, articles, videos, temporary updates where verified |
| Coalition | Find people and activity on the living map | Synchronized list alternative, communities, events, projects, games, needs, shared resources, toolbag |
| Coliseum | Discover topics and events, then participate | Live sessions, debates, rounds, challenges, teams, evidence, standings, completed briefs and replays |
| You | Express identity and see your activity | Character, contribution history, public profile, saved collections, rewards, private Studio, settings |

Search, the activity inbox, and one create launcher remain consistently reachable. They are actions, not additional bottom tabs. The create launcher offers supported tasks such as post, record, write, create an event, or issue a challenge; contextual launches retain the selected community or topic and show its audience before publishing.

Main destination order and meaning stay stable. Onboarding choices personalize content and suggested actions rather than repeatedly rearranging navigation. A creator may pin a Studio shortcut without adding another permanent destination for everyone.

## 3. Simplification inside every destination

Use **destination → item → action**: Coalition → event → RSVP; Coliseum → match → vote; You → draft → publish.

- Give each screen one primary purpose and one obvious next action.
- Allow at most one local mode selector. Do not stack tab bars or rebuild them through several dropdowns.
- Filters narrow the same collection; they show active selections, result counts where available, and a clear reset. They do not silently change the audience or feed ordering contract.
- Open an item to work with its discussion, evidence, participants, tasks, or results. These belong to the item, not parallel global tabs.
- Use a bottom sheet for short choices, filters, and quick tools. Use a full page with a clear back path for writing, project management, financial records, and other sustained work.
- Keep one primary home for each capability. Contextual links open that same destination directly instead of building duplicate editors and stores.
- Make tools searchable, pinnable, and available through relevant items. A large undifferentiated More menu is not the target design.
- Preserve scroll position, filters, playback position, unfinished work, and return context. Deep links should open the intended item after authentication when access permits.
- Keep short text labels and accessible names with icons, visible alternatives to gestures, captions, reduced-motion support, and keyboard access.
- Explain public-facing controls using familiar words such as people, groups, community, and tools. Introduce Circle, Reach, dens, canopies, rings, crews, and kits progressively where useful.

The shell becomes simpler while feature access remains explicit. Moving a control never grants access or removes permission checks. Incomplete features stay hidden or clearly marked according to existing release policy.

## 4. Nested-tab migration map

Current source already consolidates parts of Coalition and Coliseum. Creator Hub still has five main tabs and eleven subviews spread below them. This table defines the next target; it is not a report that every migration is complete.

| Current feature/tab | Target home | Interaction replacing permanent subtabs |
| --- | --- | --- |
| Home content categories and browsing formats | Home feed or Discover | Format and topic filters on the current collection |
| Circle / Reach | Home | One compact selector; retain chronological ordering |
| Coalition `map` | Coalition | Default map; Map/List is the one local mode selector |
| Coalition `events` | Map/list and event detail | Event layer or event cards; open to RSVP, discuss, or organize |
| Coalition `shop` | Place/listing detail linked to FBM | Marketplace layer or listing cards; use FBM transaction authority |
| Coalition `needs`, `resources` | Community board in the toolbag and relevant places | Request/Offer filters; retain distinct backing records and permissions |
| Coalition `projects`, `tasks` | Project detail; personal assignments in the activity inbox | Open a project for progress and tasks; retain standalone tasks with a direct tool entry |
| Coalition `rings`, crews and memberships | Your groups launcher | Searchable communities/groups and direct links to their activity |
| Coalition `chat` | Relevant permitted community/den or inbox conversation | Contextual conversation entry; preserve membership and encryption rules |
| Coalition `documents` | Relevant group/project and toolbag | Open the shared document collection in context |
| Coalition `ai` | Applicable workspace tools | Explicit helper action only where supported and enabled |
| Coalition `kits` | Customize action in the applicable workspace | Preview and apply a supported kit without a permanent Kits tab |
| Coliseum `topics`, `live` | Coliseum browser; topic/event detail | Live now, upcoming, ongoing, and completed filters; live player within its topic/event |
| Coliseum `debate`, `match`, `arena` | Topic/match participation screen | Current round, player, discussion, and eligible participation actions |
| Coliseum `shouts` | Topic cards and create/challenge actions | Media-seeded topic rather than a separate global destination |
| Coliseum `sources` | Topic/match detail | Evidence drawer with citations, context, and unresolved claims |
| Coliseum `reel` | Home/Coliseum filtered clips and related topic | Open a clip and follow its link to the full context |
| Coliseum `knowledge` | Searchable completed topics and briefs | Completed filter and archive search |
| Coliseum `challenges` | Discoverable challenge cards, create launcher, and activity inbox | Start/accept a challenge; preserve existing challenges without assuming they all have a topic ID |
| Coliseum `leaderboards` | Relevant competition, subject, or community | Standings action with scope and time window |
| Creator Hub `overview` | You → Studio | Working dashboard: continue a draft, publish, review activity, or resolve a connection |
| Creator `content` with `live`, `replays`, `clips` directories | Audience browsing in Home/Coliseum; creator-owned library in Studio | Format/status filters; opening a piece exposes its management actions |
| Creator `kits` | Studio/workspace Customize | Preview/apply in context; preserve owned entitlements |
| Creator `earnings` with `rewards`, `splits`, `credits` | Studio → Earnings | Summary and focused records; keep currencies, noncash rewards, liabilities, and entitlements distinct |
| Creator `listings` | Studio → Products, linked to FBM | Product list and detail; preserve canonical checkout and fulfillment ownership |
| Creator `integrations` with `broadcast`, `connections`, `bridges`, `health` | Studio → Connections | One connection list; each connection exposes supported settings, status, failures, and broadcast controls |
| Governance, roles, proposals, treasury | Relevant community | Decision and management actions; official decisions remain distinct from contest voting |
| Profile, character, contribution, saved collections, rewards | You | Profile content and focused pages opened through labeled actions |
| Existing privacy and advanced organization protection | Existing You → Settings → Privacy; contextual Blackmask handoff | Preserve six-section privacy controls; Blackmask consolidates advanced private collaboration/security without deleting working Blackout controls |
| Technical plugin/preset/integration/hosting authoring | Persistent Forge hub near Settings/Privacy and contextual Forge links | Forge owns advanced editors and configuration; ordinary apply/use/revoke actions stay in the consuming app; role/runtime gates and return context required |

Keep legacy routes, stored selections, enabled-tab gates, and shared links working through route adapters. A removed tab maps to its new location; it does not delete records or make permitted specialist tools unreachable.

## 5. Home: a social feed with a visible human path

Preserve the existing Circle/Reach contract:

- Circle contains eligible content authored by people the user follows.
- Reach contains eligible content deliberately relayed inward by someone in that Circle.
- The relay path explains how content arrived. Withdrawing a relay retains the honest historical path under the existing contract.
- Circle/Reach ordering remains chronological. Contribution standing does not reorder it, inject recommendations, or introduce hidden caps.
- Discover remains separate and is opened through search/explore. User-selected interests, formats, communities, and supported discovery ordering apply there.
- Encrypted den/room content is excluded from public relays. Public authorship and visibility checks remain authoritative.

Following chooses whose activity a person receives. It remains a useful relationship even though follower totals do not determine contribution rank. Distinguish the Reach feed label from the analytics label People reached.

Home accommodates short posts, questions, photos, polls, videos, articles, guides, and supported temporary updates. Formats are filters or viewers, not extra permanent tabs. A creator has one public profile linking their work, events, and community activity. Related content can lead from an article to a Coliseum discussion and then a Coalition project.

## 6. Coalition: the world and the tools you carry

**Game reuse direction (2026-11-21):** The [Coalition game plan](BLACKOUT_COALITION_GAME_PLAN.md) evaluates Pokemon Walk gameplay, PraxisMapper spatial services where needed, and optional LocAR.js camera encounters. It defines original companions, cooperative quests, creator-made packs, licensing/maintenance boundaries, and phased integration acceptance. Keep Coalition as the map foundation; adoption and a working game remain future implementation work.

Build on the existing map-first `CoalitionView` and toolbag. Use the existing map/place/area services rather than a parallel map backend. Add an accessible list alternative that respects the same scope, permissions, filters, and chosen network; remote communities remain usable without granting location access.

The map legend controls activity layers. Tapping a pin opens the actual event, project, need, resource, or offering and a relevant action. Public locations are permission-safe, consented records; private homes and live member positions are not public markers.

The toolbag offers search, recent tools, and a few user-pinned favorites. Group the list on one sheet under plain labels such as Coordinate, Share, and Customize. Avoid category → subcategory → tab hierarchies. Existing chat/documents need an appropriate den; AI helpers retain their capability gates.

Some current needs/projects/resources lack structured coordinates. Mapping them automatically requires an explicit data migration and place association, not merely drawing another layer. A visual/masonry discovery option from the companion strategy can be a list presentation preference while retaining the same collection and permissions.

Gameplay connects participation with visible shared progress:

- Community quests and manageable real-world actions.
- Collaborative challenges needing different skills.
- Short learning paths followed by an opportunity to apply or share knowledge.
- Consented exploration, participating places, local games, and IRL events.
- Seasonal team objectives, shared milestones, and contributor recognition.

Each activity explains what is happening, what help is needed, and the next available action. Credit organizing, explaining, documenting, welcoming, and supporting as well as creating and competing. Optional breaks do not erase achievements.

## 7. Coliseum: live culture and meaningful crowd participation

Coliseum is the home for live events and online debate culture. Organize around topics and events, with live/upcoming/ongoing/completed filters rather than separate strips for every interaction.

The topic/event opens a stage-and-crowd experience: main player or round, one current participation action, discussion, and optional evidence/rules panels. The action can change to Watch live, Ask, Request microphone, Submit evidence, Respond to round, Vote, or View result according to format and eligibility. A supported live session should minimize while the user checks evidence and return without losing context.

| Format | Target experience | Evidence boundary |
| --- | --- | --- |
| Debate | Claims, evidence, summarize-opponent/steelman, rebuttals, rounds, published closing rules | Match/round/voting/brief code exists; complete behavior needs runtime validation |
| Challenge | Teams or individuals pursue an objective with a clear finish | Challenge and competition surfaces exist; new variants require implementation checks |
| Conversation | Informal live discussion without a forced winner | Proposed event format; verify media and moderation flows |
| Show | Performance, interview, demonstration, or premiere | Proposed format; do not equate streaming infrastructure with a finished show workflow |
| Watch party | Shared viewing with discussion | Proposed; verify synchronization, permissions, and media rights |

Spectators can influence eligible questions, contribute evidence, support a team, express support/disagree/disapprove/boo, join preparation, and vote under the event's published rules. Recognition credits useful crowd and team participation in the finale. Watching alone remains a valid option.

Preserve asynchronous rounds and catch-up participation so attendance at one scheduled livestream is not required. Use summaries, replay links, and completed briefs to retain context.

Publish objectives, roles, scoring actions, limits, tie rules, and deadlines before a contest. Separate audience preference, argument quality, and factual support in results; an audience-selected winner does not establish truth. Purchases, rank, and reward points cannot buy extra votes. Rivalry remains subject to existing community rules and appeals.

The optional strategy bench teaches cooperation/defection, alliances, bargaining, coordination, and turnout through interactive examples. Unvalidated estimates are labeled scenarios, not measured probabilities of winning. Team color, champion support, shared victories, and contribution records support pride without requiring every participant to be on stage.

## 8. Contribution standing, reach, character, and rewards

Retain subject-specific reputation as a foundation. Expand the recognized activities beyond votes, formal proposals, debate achievements, and transactions. Spending or already having a large audience must not be the only practical route to progress.

| Contribution path | Examples | Proposed evidence of completion |
| --- | --- | --- |
| Connect | Relay a useful request or connect collaborators | Supported aggregate downstream action/recipient acknowledgement; never assume a relay caused an outcome |
| Teach | Explain, translate, caption, or contribute a guide | Accepted contribution, useful feedback, or completed learning activity |
| Support | Welcome, document, contribute evidence, help a team | Relevant recipient/organizer acknowledgement under transparent rules |
| Organize | Coordinate an event, project, or shared resources | Completed milestones and attributable participation |
| Create | Writing, video, art, entertainment, tools | Useful audience response and supported outcomes |
| Complete | Follow through on a task or collaboration | Recorded completion and appropriate confirmation |

Define event identity, completion rules, deduplication, limits, disputes/corrections, and reversal behavior before granting points. Repeated clicks, empty comments, unattended scrolling, and circular self-endorsement are not meaningful completion evidence. Quiet contributors and newcomers need attainable routes that do not depend on cash or existing distribution.

Keep these signals distinct:

| Signal | Meaning |
| --- | --- |
| People reached | Measured unique audience within a disclosed period/scope; distinguish from impressions and estimated relay potential |
| Response | Meaningful replies, saves, participation, joins, or other explicitly defined actions |
| Outcome | Completed learning, collaboration, events, or project work where recorded |
| Recognition | Relevant feedback and acknowledgement |
| Contribution standing | Explainable subject/path/community progress based on eligible contributions |
| Rewards and ownership | Earned assets, feature entitlements, cosmetics, and digital product choices; separate from money and voting power |

Do not display unmeasured reach or inferred attribution as fact. Separate paid promotion from organic distribution in analytics and contribution rules. Use community, topic, and seasonal standings so large cumulative totals do not monopolize all recognition. Discovery should give newcomers opportunities before they have a score; this does not change the chronological Circle/Reach feed.

A public profile might show Community Builder · Level 8, People reached this month, projects helped, and events hosted, with an explanation of each metric. Users choose which achievements and associations are public; credit must not expose a recipient's need, private membership, or location.

Characters express a chosen identity and develop through parallel paths: helping, organizing, learning, creating, and competing. Offer badges, titles, appearance choices, equipment, and real native digital products. Short goals show saved progress and attainable next steps. At milestones, users can select an available reward; variable discoveries/cosmetics do not obscure guaranteed effort or benefits.

Platform enhancements use one-time purchases, not recurring platform plans. Earned native-feature access is a separate acquisition route. Reconcile legacy tier/subscription assumptions before migration; creator offerings require explicit product policy and verified settlement. Preserve service-owned balances and entitlements, prevent duplicate grants/charges, and do not assume cross-app XP or ownership is already interchangeable. FBM commission/payout policy is unchanged.

## 9. You, Studio, and ecosystem boundaries

You opens into the character, chosen public identity, contribution progress, current commitments, and saved content. Edit profile, Studio, Rewards, and Settings open focused pages. Reuse the existing profile block/visibility model and allow optional custom appearance without making a complex profile editor the onboarding gate.

Studio is private; the public creator profile shows published work, events, community links, and supported offerings. Studio presents useful work first: continue a draft, publish, manage products, inspect earnings, review an outcome, or fix a connection.

| Studio task | Target interaction |
| --- | --- |
| Publish | Draft/schedule/publish a supported video, article, or guide; show destination-specific results |
| Manage content | One owned-content library with status/format filters, not audience directories nested under creator tabs |
| Plan and collaborate | Campaign brief, audience goals, calendar, collaborators, bounties, and relevant community/FBM calls to action |
| Research and measure | Supported source-dated aggregate topic/geography information and actual analytics; preserve missing-data and inference labels |
| Products | Manage supported listings through the FBM integration |
| Earnings | Summary with clearly separated cash, credits, noncash rewards, split agreements, and settlement states |
| Connections | Linked platforms, supported publishing/broadcast controls, bridges, health, and actionable failures together per connection |
| Customize | Preview and apply owned/supported kits and optional plugins in context |

Existing split-contract UI is read-only; activation and archival currently belong to the FBM creator portal. Make that handoff explicit and preserve its canonical records. Do not infer support for every external platform from the presence of a Connections screen.

Blackout owns public/social discovery, Coliseum, Coalition, and creator engagement. FBM owns trade, transactions, checkout, and fulfillment. Blackstar owns eligible transport operations. Blackmask supplies private communication and protection workflows through agreed integrations; retain existing permitted Blackout den communication during this transition. Avoid duplicate identities, disconnected inboxes, or silent publication of private material. Linked services retain their own authorization checks.

## 10. Onboarding, return journeys, and community ownership

Use short visual onboarding: username/password account flow under current deployment rules; choose interests and optional watch/create/connect/compete directions; preview a starter persona/toolkit; choose a useful first action; show its saved result. Optional details can wait. Do not auto-follow or inject undisclosed recommendations into Circle/Reach to conceal an empty account.

A new user previews people/groups in Discover and explicitly follows or joins them. Invite and shared links preserve their event/publication/game/community destination through signup and permission checks. Explain an empty feed with a clear route to build a Circle; profile completion is not required to begin.

Develop the existing room-scoped Awaits me / About me / Pulse concept into an app activity inbox: Needs your response, Your conversations, and Updates. Group related activity, honor notification preferences, and link directly to the requested action. Keep personal commitments available without navigating to every group's tasks.

Community pages expose purpose, membership, projects, events, decisions, roles, and shared-resource accountability in context. Governance and treasury actions remain role-gated. Official community decisions are visibly distinct from Coliseum audience contests. Moderation, reports, rules, and appeals remain reachable from the affected item/community.

Saved collections support quick capture and later organization. Whisperlists remains a draft specification; do not advertise its full privacy/collaboration behavior as shipped. Publishing a sanitized subset requires explicit audience review. Audience and expiration controls stay visible when posting supported temporary updates; expiration is not a guarantee against screenshots, copies, or exports.

## 11. Replacement experiences requiring verification

| Familiar use case | End-to-end experience to account for | Review boundary |
| --- | --- | --- |
| X-style conversation | Posts, threads, quote context, reply controls, search, corrections | Existing wall/feed/topic code does not prove parity across all flows |
| Substack-style publishing | Articles, publication identity, archives, subscriber preferences, email delivery, export | Article/guide publishing code exists; full newsletter delivery was not verified |
| TikTok-style video | Recording, editing, captions, audio rights, playback, attribution | Video/composer/clip code exists; complete native and publishing flows require checks |
| Instagram-style sharing | Photo sets, galleries, tagging permissions, collaborations | Verify complete creation/viewing/permission flows before advertising |
| Snapchat-style updates | Camera, selected audience, expiry, saving behavior | Status expiry and camera work do not establish a complete disappearing-story product |
| Facebook-style community | Groups, invitations, events, roles, announcements, recurring activity | Community/event primitives exist; validate each composed journey |

The supported installable shell is `blackout-mobile/` using Capacitor and `apps/blackout-client`; the earlier Expo guide is superseded. Native acceptance includes camera/microphone permission denial and recovery, reliable media uploads/retries, push and deep-link return, back navigation, safe areas/keyboard, accessible controls, and supported background/minimized playback behavior. Verify on physical iOS/Android devices before claiming store-release readiness.

## 12. Source evidence and limits

| Reviewed source | What it supports |
| --- | --- |
| [Circle/Reach documentation](../features/circle-reach-feed.md), `packages/api/src/modules/feed.ts`, `packages/core/src/feed/` | Human relays, visibility checks, chronological Circle/Reach contract, separate Discover |
| `apps/blackout-client/src/app/features/coalition/CoalitionView.tsx` and `toolbag/toolBagEntries.ts` | Map-first shell, toolbag entries, capability gates, documented coordinate gaps |
| `apps/blackout-client/src/app/features/coliseum/ColiseumView.tsx` and `tabConsolidation.ts` | Topic-level consolidation already begun; five remaining cross-topic tabs |
| `packages/core/src/coliseum/match.ts`, `brief.ts`, client `tabs/MatchTab.tsx` | Structured rounds, votes, records, and concluding brief surfaces |
| `packages/core/src/reputation/index.ts` | Subject reputation, existing event weights, arena records; broader contribution rules remain work |
| `apps/blackout-client/src/app/state/streaming.ts` and feature `streaming/tabs/` | Five hub tabs with eleven subviews; existing compatibility remaps |
| `packages/core/src/creator/content.ts`, client creator/streaming surfaces | Draft/schedule/publish models, distribution targets, products, earnings, kits, and integrations surfaces |
| Client `streaming/sections/SplitContracts.tsx` | Read-only split-contract display and FBM handoff |
| Client `notifications/components/NotificationsDrawer.tsx` and `NotificationsBottomSheet.tsx` | Room-scoped activity categories and mobile presentation, not a completed global task inbox |
| `packages/core/src/profile/`, client profile/governance features | Profile blocks/visibility, customization, and governance UI foundations |
| [Whisperlists specification](WHISPERLISTS_PRODUCT_SPEC.md), [mobile guide](../../mobile-application-build-guide.md) | Draft list requirements and current Capacitor build path, respectively |

This is a focused product/source review, not an exhaustive audit of every plugin, module, or custom integration. Existing source and feature flags do not establish deployed behavior. Keep planned work, code presence, and verified end-to-end availability separate in release and marketing materials.

## 13. Delivery slices and acceptance

| Order | Slice | Acceptance |
| --- | --- | --- |
| 1 | Navigation inventory and adapters | Every current tab/subview/tool has a target home, permission gate, legacy-link mapping, and discoverable entry; no stacked tab bars |
| 2 | Newcomer journey | Shared destination survives signup; explicit follow/join builds a Circle; user reaches one useful item and returns with context |
| 3 | Home and contextual creation | Circle/Reach remains chronological; Discover stays separate; format filters and publication audience are clear |
| 4 | Coalition participation | Same permitted collection appears on map/list; event/project action completes; nonlocated records remain usable; tool search/pinning works |
| 5 | Coliseum crowd journey | A person discovers, participates, and reaches a reproducible conclusion with rules, evidence, and contributor recognition; supported asynchronous participation works |
| 6 | Contribution and character | Completion evidence grants the correct scoped standing/reward once; explanation, privacy, corrections, and newcomer access work |
| 7 | Creator outcome journey | Creator publishes, reaches an actual audience, collaborates or links an offer, and views supported outcomes with honest integration/payment states |
| 8 | Native readiness and staged rollout | Key journeys pass on supported devices; permissions, links, playback, recovery, accessibility, and rollback meet release gates |

Measure time to a useful action, unnecessary navigation/backtracking, task and contest completion, filter success, newcomer discovery, meaningful contribution, reward delivery, and creator/community outcomes. Check whether users understand where they are and what happens next. Scrolling duration and total tab reduction alone do not demonstrate success.

Preserve the existing whole-product MVP priorities and security/operations gates. Ship verified slices, maintain compatible deep links and records, and retain an operational rollback path. Future formats and advanced integrations can be staged without reopening the global navigation design.


## 14. Privacy consolidation and visual privacy (2026-11-27)

The [privacy controls plan](BLACKOUT_PRIVACY_CONTROLS_PLAN.md) consolidates privacy under the **existing You → Settings → Privacy tab**. Use six expandable sections: Screen & notifications; People & activity; Sharing & metadata; Location & identity; Devices & connected tools; My data & cleanup. Contextual shortcuts and old settings routes open the same editors and preserve permission gates and saved settings. No additional primary tab or duplicate settings store.

Add optional Privacy View with hold-to-reveal, concealed identifying context, immediate Cover screen, private notifications, app-switcher cover and supported native capture protections. Keep Cover screen distinct from stopping a live broadcast, vault locking, session revocation and destructive cleanup. Android FLAG_SECURE and iOS capture-state redaction have different capabilities; external cameras and compromised endpoints remain limits. Experimental anti-OCR rendering is research-only, off by default and never a promise that readable content cannot be extracted.

The plan inventories current source for blocking/DM choices, separate display/sending receipt and typing controls, location consent, supported-format metadata removal, tracking-link cleanup, Shield detection, transparency/export and selected local cleanup. It also specifies private interests/audiences, remote-content consent, connected-tool access and identity separation. Current avatar perturbation is not proven face-recognition protection; Panic Wipe retains Matrix IndexedDB message history and decryption keys. Source presence does not establish production enforcement.

Blackmask reuses appropriate UX and host-level controls while retaining its independent Bitwarden-derived vault lock and Blackout-owned Matrix communication. Verify both mobile WebViews and all transitions. Core privacy, recovery and accessibility remain independent of purchases or rewards. The companion plan supplies inventory evidence, platform boundaries, delivery order and acceptance checks; this update changes documentation only.


## 15. Software-map alignment: Blackmask and Forge (2026-11-27)

The [Blackmask software map](https://github.com/Blackmarket-coa/blackmask/blob/main/docs/black-mask/software-map.md) consolidates 36 proposed individual/organization privacy-security workflows under Chats/Spaces/Vault and the six existing Privacy sections. Blackout remains the owner of public/social publishing, Coalition, Coliseum and Matrix transport/room authority; retain current permitted communication and local privacy controls during any transition.

| Blackout context | Everyday action | Advanced handoff |
| --- | --- | --- |
| Privacy, conversation or private group | Use current supported controls; review identity, audience and encryption | Open the authorized Blackmask protection/Space context for shared-vault, guest/access review, document-intake or incident workflows where implemented |
| Community, appearance or enhancement | Apply/use a compatible result and manage normal community participation | Author/edit a technical enhancement/preset in Forge |
| Go live, stream sharing or hosting status | Start/stop the intended live, choose a prepared destination and see actual state | Context-specific stream/embed/domain/federation/server setup in Forge |
| Settings/account navigation | Find the relevant configured project/tool | Persistent Forge entry near Settings and Privacy with a lightweight app-native hub |

The [Forge software map](https://github.com/Blackmarket-coa/Forge/blob/master/SOFTWARE_MAP.md) defines technical ownership, capability discovery, platform/role gating and return paths. Do not pass decrypted chat/vault content, raw tokens or deployment keys in handoff URLs. Reauthorize the destination and preserve intent when signed out, denied or unavailable. Account linking does not grant private-content access or correlate identities by default.

The 136-repository privacy/security catalogue remains research, including archived/restricted holds. Organization administration does not grant personal vaults or unrelated conversations. New workflows, native capture limits and offboarding/recovery remain subject to their implementation and verification gates; no release readiness or UI behavior changes through this map update.
