# Blackout — Whole-Product Minimum Viable Product

**Status:** Proposed product-level MVP definition; not an assertion of deployment readiness.  
**Date:** 2026-11-03  
**Scope:** Entire Blackout experience, not just Coalition.  
**Companions:** [Feature inventory](features/OVERVIEW.md) · [Known limitations](../KNOWN_LIMITATIONS.md) · [Participation strategy](BLACKOUT_HABIT_AND_PARTICIPATION_STRATEGY.md) · [Coalition field operations MVP](COALITION_FIELD_OPERATIONS_MVP.md)

## Product promise

**Blackout is a place to talk with friends, discover information and communities, share content, debate, organize, and support creators—with meaningful user control over privacy and participation.**

It should feel like one coherent app, not a collection of unrelated modules. The first public-facing MVP must prove three repeatable behaviors:
1. **Come back:** A passive user finds useful or entertaining material and familiar people.
2. **Share first:** A user can post, message, or start a discussion with minimal friction.
3. **Organize or earn:** An active user can manage a community or creator activity and reach a concrete outcome.

The goal is a credible alternative for everyday communication, community, discovery, and expression—not parity with Discord, TikTok, Twitch, Patreon, and Facebook at launch.

## Primary users and golden paths

### A. Passive member: join, discover, return
1. Register/invite, choose a profile and privacy defaults.
2. Discover a Canopy, enter a Den, and follow a relevant discussion or creator.
3. Read a feed or media post, react, save/share, and find a friend or group.
4. Receive a useful, controllable notification and return to the correct context.
**Success:** Useful discovery and repeated social interaction without requiring content creation.

### B. Friend group: private communication
1. Create or join a Den.
2. Exchange messages, images, reactions, and replies.
3. Start a voice call when configured and supported.
4. Manage membership, mute, block, and leave; understand E2EE limitations.
**Success:** Reliable communication with clear privacy and error states.

### C. Creator: publish and build an audience
1. Create a profile and publish a text, image, or short video post.
2. Reach followers and a discoverable community feed.
3. Respond to comments, view basic engagement, and link to a creator offering.
4. Use one **verified working** monetization path only if payments, entitlements, and settlement pass end-to-end testing; otherwise label monetization beta/deferred.
**Success:** Creator publishes and reaches an audience without juggling multiple Blackout surfaces.

### D. Community organizer: build and moderate
1. Create a Canopy and Dens, invite members, assign roles.
2. Publish an announcement/event or task and coordinate participation.
3. Moderate content, review reports, and apply community rules with an appeal path.
4. Observe completion or attendance.
**Success:** An organizer can sustain a small community without manual external workarounds.

### E. Coliseum participant: debate constructively
1. Discover a debate or challenge.
2. Submit a stance/argument and evidence.
3. Reply, vote or react within clear rules.
4. See outcomes and report abuse.
**Success:** Competitive expression without targeting individuals or compromising moderation safety.

## Required MVP surfaces

| Surface | Must work in first release | May be staged/deferred |
| --- | --- | --- |
| Identity and onboarding | Invite/register, login/logout, profile, account recovery, understandable privacy controls | Multiple identities and advanced pseudonym switching |
| Communication | E2EE text, attachments, replies/reactions, notifications, membership, reliable sync | Advanced OPSEC/deaddrop/mesh and every bridge |
| Canopies and Dens | Create/join/discover, roles, basic moderation, announcements | Full federated governance sophistication |
| Home/discovery | One understandable home feed or discovery entry point, follow/join, content navigation | Complex recommendation engine and all feed formats |
| Posting and sharing | Text/image posting, simple media playback, comments/reactions, share/copy link | Full video editing studio, multi-platform simulcast |
| Creator tools | Creator profile, publishing, basic insights, link to offers | Full subscriptions, gifts, ad splits, multi-rail payouts |
| Coliseum | One complete debate/challenge journey with rules and reporting | Large faction wars, tournaments, complex reputation |
| Coordination | Basic event/task/RSVP in a community | Full Coalition field-operations suite and live GPS |
| Safety and privacy | Block/report, role enforcement, visible encryption/failure states, abuse handling, data controls | Advanced privacy marketing claims without proof |
| Platform | Responsive web app, mobile browser usability, diagnostics, rollback | Desktop/native store release parity at MVP |
| Ecosystem | Clear navigation and nonbroken links to FBM and other planned components | Deep Blackstar/Blackmask/BMC Connect integrations |

**Design rule:** Ship fewer surfaces that complete the journey rather than many half-working tabs. Hide or mark unready features; never imply that a coded module is operational merely because a route or UI exists.

## MVP navigation

- **Home:** Feed/discovery and recent activity.
- **Dens:** Messages, friend groups, and Canopies.
- **Create:** Post/share media and launch a discussion.
- **Coliseum:** Debates and challenges.
- **Profile:** Identity, creator presence, privacy, settings.

Creator tools, governance, events, and Coalition operations can be contextual entry points rather than permanent global tabs. Maintain a consistent mobile and desktop information architecture.

## Release priorities

### P0 — Nonnegotiable foundation
- One reliable authentication/onboarding flow.
- Stable Matrix session, message delivery, E2EE verification, and honest decryption error handling.
- Core permission enforcement, moderation/reporting, account controls, and abuse response.
- Responsive navigation, accessible UI, predictable notifications.
- Deployment, monitoring, rollback, backup/retention, and security review.
- Test what is **actually deployed**; code presence is not proof of production availability.

### P1 — Daily-use loop
- Home/discovery, Canopy/Den discovery, follows/joins.
- Text/image post and simple media playback; reactions/replies/sharing.
- Return path via relevant notifications and recent activity.
- Creator profile and simple publish/engage/insights flow.

### P1 — Community and expression loop
- Canopy creation and basic role/moderation flow.
- One end-to-end Coliseum debate/challenge.
- One event/task/RSVP coordination path.

### P2 — After MVP proof
- The Void anonymous starters with abuse-resistant anonymity design.
- Rich faction systems, cooperative games, local quests, location experiences.
- Advanced creator coalitions, cross-posting, livestream/VOD polish, payments and subscriptions.
- Coalition field operations beyond basic tasks/events (separate MVP specification).
- Mesh/LoRa, offline-first field operations, deep Blackstar and FBM integration.

These are proposed product priorities; they do not supersede existing infrastructure or operational trackers.

## Explicitly out of the whole-product MVP

- Mandatory live GPS or background location.
- Every feature in the codebase exposed by default.
- A fully autonomous moderation system.
- Promises of complete anonymity or zero metadata leakage.
- A complete Twitch/Discord/Patreon/TikTok replacement at launch.
- Payment flows without tested entitlement, refund, settlement, and fraud controls.
- Unverified emergency-response functionality or safety-critical location tracking.
- Cross-platform feature parity if web workflows are not yet reliable.

## Pilot: the minimum meaningful demonstration

Recruit a small, consented test cohort with passive members, creators, and organizers. In the same deployed environment:
1. New member signs up and joins a community.
2. Two friends communicate privately and complete a call where configured.
3. A member discovers, reacts to, and shares a post.
4. A creator publishes content and receives real audience interaction.
5. An organizer creates a community event/task and participants respond.
6. Two participants complete a Coliseum debate/challenge.
7. A moderator handles a report, and a member can leave/revoke access.
8. Participants return organically and explain what value they received.

No single feature substitutes for the complete experience.

## PR-sized implementation workstreams

| Workstream | First deliverable | Gate |
| --- | --- | --- |
| MVP-00 Inventory | Audit deployed vs code-only vs broken vs gated; identify ownership and dependencies | Evidence-based readiness matrix |
| MVP-01 Foundation | Auth/session, E2EE failure handling, permissions, telemetry/rollback | Security and reliability tests |
| MVP-02 Social shell | Simplified Home/Dens/Create/Coliseum/Profile navigation | Mobile and desktop usability tests |
| MVP-03 Discovery | Join/follow, feed, recent activity, notifications | End-to-end return journey |
| MVP-04 Publishing | Post, media playback, react/reply/share | Creator-to-reader end-to-end test |
| MVP-05 Communities | Canopy/Den creation, roles, moderation, event/task | Unauthorized-access and abuse tests |
| MVP-06 Coliseum | One complete debate/challenge with reporting | Safety and completion tests |
| MVP-07 Creator | Profile, simple insights, verified offer link | Creator journey test; no unsupported payment claims |
| MVP-08 Pilot | Invite cohort, monitor failures, gather feedback, fix blockers | Release decision and rollback plan |

These are proposed workstream IDs, not existing pull requests.

## Release criteria

**Security:** No known critical auth/authorization bypasses; E2EE claims verified for each surface; sensitive data does not leak through search, notifications, logging, or third-party map calls.

**Reliability:** Core messaging, login, posting, joining, and notifications work in the deployed environment; failures are visible; no silent success claims.

**Usability:** New users can reach a Den, discover content, and share within minutes without documentation; accessible mobile web path.

**Community health:** Blocking, reporting, role moderation, and appeals are usable and staffed.

**Creator value:** At least one creator can publish, engage with an audience, and identify a useful result; financial claims require actual end-to-end transaction proof.

**Retention/value:** Pilot participants return because they found people, information, expression, or useful tasks—not because of coercive notifications or location streaks.

**Operational:** Owner for incidents, monitoring, support, backups, retention, and rollback.

## Evidence required before declaring MVP complete

For each required journey, record: repo paths, environment/feature flags, test evidence, deployment URL, owner, status (**verified live / tested staging / coded unverified / proposed / blocked**), and known limitations. Reference [feature overview](features/OVERVIEW.md), [known limitations](../KNOWN_LIMITATIONS.md), [threat model](../THREAT_MODEL.md), and the canonical [operations guide](AGGRESSIVE_OPERATIONS_GUIDE.md). Do not infer completion from documentation or component names.

## North-star measure

**Weekly users who complete a meaningful action:** communicate with someone, participate in a community, share content that reaches another person, finish a debate, organize an event/task, or earn through a verified supported flow.

Track supporting measures: successful onboarding, delivery/decryption failures, repeat social interactions, creator publishing success, moderation resolution, user-reported value, and retention. Treat time spent as a diagnostic, not the product's goal.

**MVP boundary:** One cohesive, reliable social and community product with a credible creator path. The full Coalition operations system and ambitious ecosystem expansions come after the core everyday experience works.
