# Blackout: agency, community, character, and creator growth

**Added:** November 15, 2026  
**Status:** Product requirements and proposed delivery sequence. This document records the new direction; it does not claim application code or production behavior has changed.  
**Companions:** [App plan and nested-tab migration](BLACKOUT_APP_PLAN.md) · [Participation strategy](../BLACKOUT_HABIT_AND_PARTICIPATION_STRATEGY.md) · [Whole-product MVP](../BLACKOUT_WHOLE_PRODUCT_MVP.md) · [Roadmap](../../ROADMAP.md)

**App organization update (2026-11-20):** The [app plan](BLACKOUT_APP_PLAN.md) owns the target Home / Coalition / Coliseum / You structure and the replacement of nested tabs with filters, item-level actions, and contextual tools. Creator Hub is a private Studio reached from You. The requirements below remain applicable within that structure; they do not require separate permanent tabs for each activity.

## 1. Product direction

Blackout should give people control, belonging, pride, hope, and visible evidence that their participation matters. Users build a character that personifies their chosen identity and grows through learning, competition, creation, and community contributions. “Build your character; build your true persona.”

The experience connects four activities:

- **Coliseum:** influence a contest, support champions, form teams, learn strategy, and reach a clear competitive conclusion.
- **Coalition:** discover a chosen network, exchange knowledge, participate in real-world activity, and see shared progress.
- **Creator Hub:** research an audience, plan and distribute campaigns, collaborate, and measure results.
- **Character:** express identity, show achievements, earn useful digital products, and choose the next goal.

The user can switch among these activities. A starter build recommends a path without permanently assigning a class or limiting participation.

## 2. Coliseum: control, teams, competition, and a finish

### Required experience

Users should feel able to affect what happens. Provide decisive roles for people who like to lead, organize, analyze, and compete, alongside simple ways for spectators to participate.

| Need | Product requirement |
| --- | --- |
| Disagree and disapprove | Distinct support, disagree, disapprove, and boo reactions; rebuttal and evidence actions remain directly reachable. Vertical browsing is neutral. Gestures have visible button equivalents. |
| Rally around champions | Follow a champion, display chosen team colors or badges, celebrate achievements, and recognize supporters who helped the team finish. |
| Exercise control | Offer opt-in roles such as participant, team captain, strategist, evidence contributor, organizer, and spectator. Show which actions each role can take and how those actions affect the contest. |
| Form coalitions | Discover compatible teams, propose alliances, negotiate shared objectives, and track joint contributions. Distinguish contest alliances from Coalition community membership. |
| Build competitive tension | Give each contest a clear objective, rounds, deadline, visible progress, and final selection. The finale announces the winner and credits meaningful team participation. |
| Select a winner through participation | Publish eligible crowd actions, voting limits, scoring, tie rules, and closing conditions before the contest starts. Show live or delayed standings according to those rules. |
| Feel pride | Preserve victory records, team milestones, contribution highlights, and a replay or summary explaining the result. |

**Proposed first format:** claim/evidence/rebuttal rounds followed by an eligible crowd vote. Reactions express sentiment; only actions explicitly included in the published scoring determine the result. The outcome is a crowd-selected winner, not automatic proof that a factual claim is true. Supporter totals and audience choice can appear beside evidence and unresolved claims.

Booing and rivalry belong to the contest. Community protections against threats, doxxing, and targeted harassment still apply. Publish anti-duplication and coordinated-abuse controls without making purchases, rank, or reward points buy additional votes.

### TikTok style Coliseum layout

Coliseum uses a full screen vertical video feed with one live room, replay or clip in focus. Swiping moves between items; it never casts a vote or expresses disagreement. Distinguish Live, Replay and Clip clearly and keep a clip linked to its full session, exact timestamp and relevant topic.

| Area | Required experience |
| --- | --- |
| Top | Current live style, topic or question, host, active round and time remaining. Compact filters remain reachable. |
| Main stage | Active speaker, side by side contestants, an organized panel or shared material according to the live format. Reflow the stage for a phone and a wider screen. |
| Action rail | Support, disagree, disapprove or boo, comments, save and share. Group secondary controls so video remains readable. |
| Bottom controls | Armory, raise hand or request a role, audience participation and the current contest or session action. |
| Detail sheet | Sources, team information, speaker queue, rules and topic history open without losing session context. |
| Crowd view | An optional audience camera mosaic beside or over the stage, with clear personal camera controls. |
| Closing state | For contests, show the crowd selected winner and contributor credits. For other lives, show the session outcome and next action. |

Offer visible button equivalents, captions, transcripts, readable contrast, reduced motion and low bandwidth or audio only participation. Opening a source and returning should preserve playback and draft contribution state. Moving through the feed never silently enables a camera or microphone. Leave or deliberately keep a live in a mini player so multiple rooms do not produce unexpected overlapping audio.

### Armory for live resources

The **Armory** is the place for resources during combative engagement: cited sources, claim cards, datasets, clips with timestamps, prepared rebuttals, notes and the game theory strategy bench. It stays reachable during a live without forcing participants to leave the stage.

Separate public session resources, team workspace and personal drafts. A participant can prepare a source card privately, submit it to the appropriate queue, and let the host feature it with its original context and review status visible. Uploading or featuring a source is not verification. Link publicly used resources to the relevant claim and permanent topic record after the session; private notes stay private.

Connect interactive lessons on cooperation, defection, bargaining, coordination, coalition formation and repeated games to actual strategic choices. Show turnout, alliance and vote share scenarios with assumptions; present measured odds only when a predictive model has been validated for that use.

### Research sources and evidence ranking

Connect scholarly search, university repositories, experiment records, datasets and primary documents to the Armory. Front the strongest evidence for the active claim, with visible reasons. The [Coliseum strategy](https://chatgpt.com/space/page_ab37aa2a56508191b7a24f6711da994f) contains the full 20 resource catalog, source card fields, ranking criteria, review workflow and delivery acceptance.

Start with OpenAlex, CORE, Europe PMC, Crossref with Retraction Watch, Unpaywall and manual submissions. Expand to Semantic Scholar, MIT Open Scholarship and Harvard DASH as university repository examples, Cochrane, Campbell Collaboration, ERIC and arXiv. Connect OSF, Zenodo and ClinicalTrials.gov for study plans, experiments, data and results. Add Census, BLS, GovInfo, Congress.gov and NOAA Climate Data Online for original statistics and records.

Label student essays, dissertations, working papers, preprints, peer reviewed studies, reviews, datasets and primary documents distinctly. Assess direct relevance, appropriate methods, inspectable support, independent corroboration, uncertainty, integrity and provenance. University prestige, citation count, likes, boos, spending, followers and contest wins must not determine evidence quality automatically.

Use four live groupings: Best overview, Best direct evidence, Strongest challenge and New or unreviewed. Source cards show the precise claim relationship, exact passage or timestamp, type, scope, methods, limitations, original locator, available data, review and access states, and why the source surfaced. Preserve strong counterevidence and distinguish a host's pin from an evidence assessment.

The live workflow is select claim, discover and inspect material, submit cited support, examine or challenge it, feature it if useful, and preserve its use on the permanent Blackout topic. Keep source versions and session timestamps; attach later corrections without erasing historical context. Private research remains permission scoped. AI can assist discovery and summaries linked to originals; it is not independent evidence or an automatic ruling.

Show unavailable checks and abstract only access explicitly. No missing retraction match guarantees validity. Verify each provider's access, capacity and reuse requirements before implementation. Acceptance includes accurate claim support, visible correction status, ranking explanations, preserved counterevidence and safe reopening from a replay.

### Crowd view and audience control

Audience members can opt in to a camera preview, then explicitly join the crowd view. Let them turn their camera off, leave the mosaic or remain an audio only spectator at any time. Explain whether the camera is visible to the room, the broadcast and any recording before joining. Provide visible recording state and controls for host and moderator removal.

The host can show a paginated or adaptive crowd mosaic and spotlight a willing audience member. Camera participation and promotion to a speaking role are separate permissions; an audience camera does not grant a live microphone. Show audience size separately from the number of visible camera tiles. Adapt the number and quality of streams to device and connection capacity.

A viewer can **mute one speaker for themselves** without muting the whole room or changing what other listeners hear. Show a speaker's aggregate current mute count with the active listener count and a clear definition; deduplicate listeners and update counts when they unmute or leave. Keep individual muters private. This is audience feedback, separate from a vote, an evidence assessment and a moderator's room wide mute. Preserve access to the source record and session transcript.

### Finding contestants members and subject matter experts

Provide searchable people and a visible speaker request queue from the current room. Search by topic, relevant skills or voluntary credentials, language, availability and participation role. Let members opt in to discovery as contestants, mentors, researchers, organizers or subject matter experts.

Allow hand raising, an application with a short relevant contribution, host invitations and temporary guest or expert seats. Hosts can review a person's consented contribution history and relevant experience, see request state and offer a specific role. An invitation or spotlight requires acceptance and does not silently enable devices. Credentials, popularity and rank do not make a factual claim automatically correct.

Preserve the host's ability to surface newcomers alongside established contributors. Provide a way to find teammates and negotiate contest alliances, distinct from joining a Coalition community.

### Moderator controls and live formats

Support organized panels, timed turns and freeform discussion. The host can choose a preset, assign cohosts or moderators, arrange seats, organize teams, open or close the queue, pin a question or source, and move willing participants between audience and stage.

**Give the mic for a chosen duration.** Offer useful presets such as 30 seconds, 60 seconds and 2 minutes plus a custom duration. Show the timer to speaker and audience, warn before expiry and release the floor at expiry according to the announced format. Hosts can pause, extend, skip or revoke a turn and see an action history. Reconnection must not create a second speaking grant or reset the turn silently.

Allow topic and round management, polls or votes, source queues, chat slow mode, speaker or chat moderation, removal, recording and clip controls. Distinguish moderator room wide mute from a viewer's personal mute. Changes from organized to freeform operation and changes affecting scoring are visible to participants; a completed contest retains its original rules and result.

| Live style | Format and outcome |
| --- | --- |
| Debates | Claims, evidence, rebuttals, timed rounds and crowd selected results under published rules. |
| Roast sessions | Clear opt in participation, an agreed premise and optional crowd judged rounds. |
| Freestyling | Performer turns, collaborative or competitive rounds, and optional judging. |
| Advice | Host or guest guidance, contextual questions and clear separation of experience from professional expertise. |
| Questions | Open questions, hand raising, expert seats and useful answer summaries. |
| Research | Shared reading, source checks, hypotheses, data walkthroughs and next investigations. |
| Raising funds | A named purpose, beneficiary, transparent progress and follow up on use and outcomes. |
| Mutual aid requests | A manageable request, available help, permission appropriate sharing and fulfillment updates. |
| Video game streaming | Gameplay or screen share, commentary, audience interaction and optional competitions. |
| Panels and community sessions | Organized or freeform conversation, learning sessions, project updates and community events. |

Offer configurable new formats rather than limiting lives to this list. A session does not need a winner unless it is explicitly a contest. Entertainment and performance remain valid uses of Coliseum; their audience response does not become factual evidence. Research and claim based segments link to canonical questions and sources. Other lives keep an appropriate session, creator or project record.

### Learn game theory by using it

Build an optional strategy bench for team members. Start with small interactive exercises: cooperation versus defection, coalition formation, coordination, bargaining, repeated interaction, and contribution incentives. Users choose an action, see a payoff table or visual consequence, and receive a short explanation.

For a real contest, show vote-share scenarios and the support needed to reach a threshold. Let teams change assumptions about turnout, alliance support, and opponent participation. Without a validated predictive model, label the result as a scenario rather than a probability of winning. Later probability estimates must disclose their assumptions, data coverage, and uncertainty.

Proposed example: a team can compare standing alone with an alliance under several turnout assumptions, then see which assumptions change the likely ranking. Participation teaches strategic thinking through concrete decisions rather than requiring a textbook first.

### Creator income and equivalent recorded participation

The [Livestream Creator Income and Recorded Video Opportunities research](https://chatgpt.com/space/page_c8926e34293c8191bc87788eebecb290) compares gifts, paid interaction, subscriptions, advertising, product and affiliate sales, contracted hosting and other work across regional examples. Its distinction is between platform design, creator and viewer goals, observed practices and improvements to test. Selected success stories do not establish typical income.

Blackout should give replays and standalone recorded videos comparable useful participation: timestamped Armory sources, later questions, text or video replies, response rounds, voluntary support, current product offers, original lessons and defined service or creative requests. Keep all formats connected to the permanent topic, creator, contribution record and valid offers.

Label live, replay, recorded video and premiere clearly. A genuine premiere may have current audience interaction around prerecorded content; do not simulate a creator being present. Separate historical crowd footage and chat from current responses. Preserve a closed contest result; later support and a new round have their own context and outcomes. Retain media permissions and offer per speaker replay audio controls only where separate permitted tracks exist.

Prioritize one time support, original digital goods, workshop or series purchases, service bookings, commissioned responses or performances, defined research or production bounties and supported FBM sales. Do not silently introduce recurring subscriptions from competitor comparisons. Hosts, moderators, researchers, editors, captioners, translators and artists can share paid work under clear terms agreed before delivery.

Show the full viewer cost, recipient, deductions, agreed collaborator shares and final available receipt. Distinguish a gift, purchase, service and contribution to another beneficiary. Verify supported payout routes, currency and timing; do not assume that earning a balance guarantees accessible cashout. Preserve FBM's established applicable 3% coalition fee without claiming a universal Blackout net payout rate.

Keep payments separate from eligible crowd votes, source ranking, factual findings and moderation authority. Give creators control over session length, availability and request scope. Optional patronage and performance remain valid uses; a comedy or music session does not need to become an educational exercise.

Pilot a performance battle and replay, a maker demonstration with an original guide or booking, and a local producer demonstration with valid FBM offers. Compare net earnings per hour of total work, successful payouts, paid request fulfillment, replay participation, audience satisfaction and moderation effort. Preserve the source based research and live versus recorded feature map in the Coliseum strategy.

## 3. Coalition: community, discovery, and useful scrolling

Coalition should deliver community building, knowledge exchange, fulfillment, and altruism. Replace the urge to passively scroll with an equally accessible way to learn something useful, meet a group, or take a manageable real-world action.

- Keep the map as the spatial foundation. Users choose the network, area, topics, groups, and time window they want to explore.
- Show what is happening in that selection: games, IRL events, learning sessions, projects, requests, available resources, and opportunities to contribute.
- Add a Pinterest-style masonry feed for visual discovery, with saveable cards and collections. Keep map and feed filters synchronized when the user chooses to link them.
- Provide an information-focused video scroll: demonstrations, explanations, local updates, project progress, and group stories. Each relevant item can open its group, map place, lesson, event, or task.
- Make belonging visible through shared milestones, welcoming interactions, collaborative collections, knowledge contributions, and recognition of completed work.
- Allow one small useful action directly from discovery: save, learn, ask, answer, RSVP, join a game, volunteer, or contribute a resource.

Use the existing Coalition map, place/area model, events, tasks, projects, needs, resources, and membership rules. Public discovery uses permission-safe records and consented geography; private homes and live member positions are not public activity markers.

## 4. Feed control at will

Feed curation is a primary control available during browsing, not buried in account settings.

Users can filter by network, group, topic, place, date, content format, and activity type; choose following, chronological, discovery, or saved views where supported; mute topics/accounts; request more or less of a content type; and reset recommendations. Let users save several feed presets and switch quickly.

Apply these controls according to the surface's contract. Home's Circle/Reach feed retains human-selected relays and chronological ordering; recommendations and ranked exploration belong to the separate Discover surface. Contribution standing does not reorder Circle/Reach. Coalition uses the map/toolbag foundation with a synchronized list alternative; a masonry option is a presentation of the chosen collection, not another permanent tab. See the [app plan](BLACKOUT_APP_PLAN.md) for the contribution model, full migration map, cold-start flow, and verification gaps.

Show active filters and offer one-action clearing. Explain recommendations briefly when requested. User-selected filters take precedence over personalization, and empty results should invite an explicit adjustment rather than silently broadening the feed.

## 5. Account creation and short visual onboarding

**Create an account with username and password.** Collect optional profile information during the tour or when a feature needs it. Explain recovery and offer a recovery method without making a long profile form the entry barrier. Keep required terms or action-specific checks brief and contextual.

### Proposed first-session flow

1. **Create:** username and password, then enter.
2. **Choose a direction:** illustrated cards for compete, connect/help, learn, or create; multiple choices and skipping are supported.
3. **Reveal a starter persona:** show a customizable character, selected interests, and a small useful starting toolkit. Appearance and public identity remain the user's choice.
4. **Complete one short goal:** follow a group, save a lesson, join a contest, find an event, or start a creator campaign draft.
5. **Show the result:** acknowledge the real action, update visible progress, and show the next attainable milestone or an earned reward choice.

Use demonstrations, highlighted targets, icons, visual previews, optional audio/haptics, and immediate feedback where they communicate clearly. Maintain short labels, accessible names, keyboard controls, captions, reduced motion, and readable explanations for consequential actions. Non-text instruction should reduce reading burden without making the interface a guessing game.

Use a repeatable pattern: relevant prompt → one clear action → immediate result → visible progress. Avoid several simultaneous prompts. Combine related steps, reuse known answers, autosave, and let people leave and resume. Progress counts actual saved or completed steps; optional setup never turns a finished goal into an apparently unfinished one.

### Motivators and heuristics

| Motivator | Intended expression |
| --- | --- |
| Social acceptance | Welcoming group feedback, gratitude, team identity, and recognition of useful contributions. |
| Pain avoidance | Remove uncertainty, repeated entry, confusing choices, and unnecessary steps; make recovery and undo easy. |
| Hope | Show an attainable next goal and a visible path toward skills, community impact, creative independence, or team success. |

Use familiar controls, recognition instead of recall, contextual defaults, one obvious next action, and immediate feedback as design hypotheses. Measure whether they help users finish their chosen goals. Avoid fabricated popularity, shame, or urgency as substitutes for useful motivation.

## 6. Progression, digital rewards, and the true persona

Characters should personify users and evolve as they gain ranks and achieve goals. Let users display the good they choose to make public: learning achievements, event contributions, completed community work, creative projects, and team victories.

- Provide parallel progress tracks so competition, learning, organizing, helping, and creating all have meaningful paths.
- Unlock visual character changes, titles, badges, equipment, and useful digital products as milestones are completed. Offer appearance choices rather than forcing a particular persona.
- Award points for meaningful completed actions. Define the completion condition and point terms clearly; avoid rewards for repetitive clicks, empty posts, or unattended scrolling.
- Let points work toward free native features. At designated completions or level-ups, let users select from a choice of available digital products, such as a theme, character item, creator template, or supported native enhancement.
- Use variable reward experiences through changing product selections, discoveries, celebrations, and optional bonus cosmetics. Keep required effort and guaranteed milestone benefits predictable. Any proposed bonus rules must be explicit; no purchase-dependent random reward system.
- A chosen reward must deliver a real asset or working capability. Preserve ownership and prevent duplicate grants or charges. One-time enhancement purchases remain the paid acquisition model.
- Keep learning, competition, and community reputation understandable separately. A single spending or popularity score should not determine a person's value or access to basic participation.
- Let users control which achievements are public. Recognizing help must not expose a recipient's private need or sensitive location.

Progress is recognition of chosen participation. Core privacy and community access remain usable without reward grinding. Optional breaks should not erase achievements.

## 7. Creator Hub: a complete campaign workspace

Use the [creator-economy plan](BLACKOUT_CREATOR_ECONOMY.md) for the approved product catalogue, participation prompts, and create-to-sale wiring acceptance. AI personas are excluded. A usable maker journey must link the relevant editor, actual deliverable, reviewed listing, audience, buyer ownership, and creator earnings; the documented production artifact-upload gap remains open.

During onboarding, creators should be able to define a target audience and campaign goal without repeating basic account setup. Creator setup is a contextual branch that can also be opened later.

| Stage | Required tools |
| --- | --- |
| Define | Campaign objective, audience interests/topics, state/region, age bands where available and appropriate, schedule, and other supported criteria. Distinguish the intended audience from measured reach. |
| Research | Trending topics from permitted public sources or creator-authorized social accounts, with source, date, coverage, and missing-data indicators. |
| Explore | Coalition map research layers for voting statistics, demographics, and financial/economic indicators, at supported geographic levels. |
| Plan | Campaign brief, content calendar, creative assets, collaborators, calls to action, and links to relevant events/projects or FBM offers. |
| Publish | Use supported Blackout and cross-platform publishing connections; show per-destination status and actionable failures. |
| Measure | Actual impressions/reach where supplied, engagement, clicks, event signups, contributions, and attributable conversions where linked systems support them. Compare results with the chosen audience and goal. |

The map can compare areas by published aggregate population, age bands, income/economic indicators, election results or turnout, and related campaign-relevant information. ZIP codes, Census areas, neighborhoods, and voting precincts are distinct boundaries. Show the source geography, year, and any estimation or boundary conversion; do not imply every indicator exists at every scale.

Treat voting data as aggregate civic research. Do not infer an individual's political views or financial condition from their neighborhood, or expose individual voter records. Audience tools must distinguish public area statistics, voluntarily supplied profile information, platform-supplied aggregate analytics, and explicit research assumptions. Public social content does not automatically supply age, location, or unrestricted reuse rights.

These are proposed research and campaign capabilities. Data sources, integrations, supported criteria, and geography coverage need verification before they are advertised as available.

## 8. Proposed delivery order and acceptance

| Order | Working slice | Acceptance |
| --- | --- | --- |
| 1 | Simple signup and character-led first goal | Username/password creates a usable account; optional details can wait; one short goal saves progress and can be resumed. |
| 2 | User-controlled Coalition discovery | Map and masonry feed respect chosen network, filters, permissions, and area; at least one event/task/learning action completes end to end. |
| 3 | Complete Coliseum contest | Users form teams, support/disagree/boo, contribute, vote under published rules, and reach a reproducible final result with contributor recognition. |
| 4 | Character and earned digital choice | A verified completed action advances the appropriate track; a milestone offers real products; selecting one grants the asset/capability reliably. |
| 5 | Game-theory learning and strategy bench | An interactive lesson explains a strategic choice; contest scenarios expose assumptions and never present unvalidated odds as measured probabilities. |
| 6 | Creator campaign vertical slice | A creator defines an audience, views sourced area/topic information, plans a campaign, publishes through a working destination, and sees actual results with gaps labeled. |

Track time to first useful action, onboarding completion and resumption, filter success, useful lessons/actions completed, event participation, contest completion and result integrity, meaningful contributions, reward fulfillment, and creator campaign outcomes. Ask users whether sessions felt useful, socially rewarding, and under their control. Time spent scrolling alone is insufficient evidence of success.

## 9. Continuity and implementation boundaries

This addition extends the existing Blackout direction: Blackout owns Coliseum, Coalition, and Creator Hub; FBM owns trade and transactions; Blackstar supports eligible transport operations. Preserve the Matrix/Cinny foundation and Blackout-owned product services. Reuse Coalition geography and coordination rather than creating another map backend.

Coordinate character presentation and reward acquisition with the FBM character/equipment plan, while keeping service-owned records, permissions, balances, and entitlements authoritative. Do not assume cross-service XP or ownership is already interchangeable. Ranks and rewards do not alter FBM's fixed commission policy.

Use the [FBM unified portal integration contract](../coalitions/FBM_UNIFIED_PORTAL_INTEGRATION.md) for shared map and portal responsibilities. The [whole-product MVP](../BLACKOUT_WHOLE_PRODUCT_MVP.md) and [operations guide](../AGGRESSIVE_OPERATIONS_GUIDE.md) retain their release gates. Earlier implementation findings require fresh source verification before coding. New or incomplete surfaces should stay hidden until their working slice is verified.

## Live participation feature map — November 27, 2026

The [live participation feature map](../features/BLACKOUT_LIVE_PARTICIPATION_FEATURE_MAP.md) records host/panel controls, timed turns, speaker priority, chat, gifts, configurable perks, drop/revive seats, gift goals, watch missions, joining, recognition, live counters and recorded participation. Its status ledger separates partial code from proposed mechanics and unverified integration. Blackout owns runtime room actions, Forge advanced setup/authoring and FBM payment fulfillment; apply the map's execution and acceptance requirements before exposing any effect.
