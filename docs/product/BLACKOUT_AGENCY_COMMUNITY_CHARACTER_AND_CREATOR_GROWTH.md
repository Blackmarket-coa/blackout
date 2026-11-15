# Blackout: agency, community, character, and creator growth

**Added:** November 15, 2026  
**Status:** Product requirements and proposed delivery sequence. This document records the new direction; it does not claim application code or production behavior has changed.  
**Companions:** [Participation strategy](../BLACKOUT_HABIT_AND_PARTICIPATION_STRATEGY.md) · [Whole-product MVP](../BLACKOUT_WHOLE_PRODUCT_MVP.md) · [Roadmap](../../ROADMAP.md)

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

### Learn game theory by using it

Build an optional strategy bench for team members. Start with small interactive exercises: cooperation versus defection, coalition formation, coordination, bargaining, repeated interaction, and contribution incentives. Users choose an action, see a payoff table or visual consequence, and receive a short explanation.

For a real contest, show vote-share scenarios and the support needed to reach a threshold. Let teams change assumptions about turnout, alliance support, and opponent participation. Without a validated predictive model, label the result as a scenario rather than a probability of winning. Later probability estimates must disclose their assumptions, data coverage, and uncertainty.

Proposed example: a team can compare standing alone with an alliance under several turnout assumptions, then see which assumptions change the likely ranking. Participation teaches strategic thinking through concrete decisions rather than requiring a textbook first.

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
