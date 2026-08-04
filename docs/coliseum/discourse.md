# Coliseum — the discourse feature

Coliseum is Blackout's structured public-reasoning layer: a video-first,
mobile-first way to turn arguments into organized, evidence-driven participation
instead of comment-war chaos. This document covers the standalone discourse
module (distinct from the launch test-flight Coalition described in
[`README.md`](./README.md)).

## Surfaces

**The topic is the spine.** A _proposed topic_ is the only thing a user creates
in Coliseum, and everything it produces — arguments, discussion, a match, a live
session, sources, a resolved brief — is a section of that topic rather than a
sibling tab.

### The strip: five cross-topic destinations

`co.bmc.coliseum` still carries the full 11-id `COLISEUM_TABS` taxonomy (a
persisted tab or an old link must never throw), but only five are strip
destinations. The split is decided by one test — _is the entity topic-keyed?_
See [`tabConsolidation.ts`](../../apps/blackout-client/src/app/features/coliseum/tabConsolidation.ts).

-   **Topics** — the feed of proposed topics, ranked by "debate heat"
    (recency × velocity), filterable by category.
-   **For You** — a vertical, swipe-to-vote reel of the strongest arguments across
    every topic. Swipe right = agree, left = disagree, scroll up = next/neutral.
-   **Knowledge** — the searchable archive of settled debates, briefs and
    explainers.
-   **Challenges** — community challenges ("start a business", "grow food"). The
    one surface here that is _not_ topic-keyed: `ColiseumChallenge` has no
    `topicId` and is a parallel entity, not a child of a topic.
-   **Ranks** — cross-ecosystem leaderboards.

There is no "More" sheet. Its five former occupants are topic sections now.

### The topic page — `/coliseum/topics/:topicId`

A topic is addressable, so it can be linked and shared.
[`TopicPage.tsx`](../../apps/blackout-client/src/app/features/coliseum/TopicPage.tsx)
renders a section rail over one scroll. Sections are **content-gated**: a
freshly asked question is a short page; a resolved match is a rich one.

-   **Topic** — the proposition, with its seed rendered in whatever form it
    arrived (a player for a video take, the article card for a link, plain type
    for a question, the callout for a challenge), plus the stance bar.
-   **Pulse** — argument and voice counts, the stance split, and whether a verdict
    has landed.
-   **Arguments** — structured stance-arguments threaded into rebuttal chains,
    with a composer (stance + body + optional short video) and a community verdict.
-   **Discussion** — free-form talk, in a canopy den. See _Conversation_ below.
-   **Match** — the 1v1 match fought over this topic, if there is one.
-   **Live** — a live debate session for the topic (see Transport below).
-   **Sources** — the citations attached across the topic's arguments.

Old deep links keep working: `/coliseum?topic=<id>` (including every
`?tab=debate&topic=` share URL already in the wild) redirects to the topic page,
and a `bmc-coliseum-tab` persisted as any of the six now-section tabs is
rewritten to the feed.

## Proposing a topic

A topic carries a **seed** describing how it arrived
([`seed.ts`](../../packages/core/src/coliseum/seed.ts)):

| Kind        | What it is                                  | What it absorbed              |
| ----------- | ------------------------------------------- | ----------------------------- |
| `text`      | A bare question or statement                | — (previously impossible)     |
| `link`      | An article URL, headline, publish date      | the old required `newsAnchor` |
| `media`     | A video or image take                       | standalone Shouts             |
| `challenge` | A proposition aimed at a user, or left open | the Arena callout             |

`newsAnchor` is retained as a deprecated, derived field so readers written
before seeds keep working; `resolveTopicSeed` accepts either representation on
both the read and write paths.

Note that only a `link` seed has an article publish date. `seedPublishedAt`
falls back to the topic's creation time for every other kind — passing an
absent date to `computeTopicHeat` scores recency as a flat `0`, which is 55% of
a topic's heat, and would quietly bury every non-link topic in the ranked feed.

## Conversation

Every chat, comment, or piece of written media in Blackout is a Matrix event in
a canopy den. No feature ships its own message store or its own comment UI.

A topic's **Discussion** section mounts the same components the canopy server
page mounts (`ForumView`, or `RoomTimeline` + `MessageComposer`), so the
composer, uploads, threads, moderation, redaction and E2EE behave identically
wherever a user meets a conversation. The den is created **lazily** on the first
comment — creating one per proposed topic would bury a canopy's channel list —
**client-side**, since the API has no Matrix identity for the user, and linked
back via `POST /v1/coliseum/topics/:id/den` on a **first-writer-wins** basis so
two simultaneous commenters can't leave a topic with two rival discussions.

Structured stance-arguments are _not_ chat and stay in `coliseum_arguments`:
they carry a stance, citations, a Wilson vote score and a Polis consensus value,
and the ranking, reel and verdict stack all read them. They are artifacts.

## Data model

Core types live in
[`packages/core/src/coliseum/`](../../packages/core/src/coliseum/):

-   **Topic** (`feed.ts`) — title, `seed` (see _Proposing a topic_ above), tags,
    category, status (`emerging → active → closing → archived`), an optional
    `discussionDenId`, and denormalized `recencyScore`/`velocityScore`/`debateHeat`.
    Note `denId` (which den it was posted in — a scope filter) and
    `discussionDenId` (the room holding its conversation) are different fields.
-   **Argument** (`feed.ts`) — `stance` (`for`/`against`/`nuance`), `stanceWeight`,
    body, citations, optional video `media`, an optional `parentArgumentId` (the
    rebuttal link), and denormalized `voteScore` (Wilson lower bound) +
    `nuanceScore` (cross-cluster consensus).
-   **Vote** (`feed.ts`) — one per `(argument, voter)`; a re-vote overwrites.
-   **Citation** (`citations.ts`) — a discriminated union (`live`, `townhall`,
    `subscription`, `audio`, `article`, `proposal`) that composes existing
    Blackout surfaces.
-   **Live session** (`live.ts`) — a topic-keyed room with a moderator-gated
    speaking queue and pinned evidence; pure immutable transition helpers.

### Ranking & consensus

`scoreColiseumArgument` blends votes, recency, citation depth, stance balance,
and consensus. `deriveColiseumWinnerVerdict` ports the Polis model
(`consensus.ts`): voters are k-means-clustered and an argument's consensus is the
_minimum_ agree-rate across clusters, so a broadly-acceptable argument can win
without dominating any one faction. `buildColiseumArgumentTree` folds the flat
argument list into rebuttal threads client-side. `rankCrossTopicArguments`
heat-blends arguments across topics for the global reel.

## API

Routes are mounted at `/v1/coliseum`
([`packages/api/src/routes/coliseum.ts`](../../packages/api/src/routes/coliseum.ts)):

| Method & path                                           | Purpose                                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /topics`                                           | List topics (filter by canopy/den/category/tag/status).                            |
| `GET /topics/:id`                                       | Topic + its ranked arguments.                                                      |
| `POST /topics`                                          | Propose a topic (`seed`, or a legacy bare `newsAnchor`).                           |
| `POST /topics/:id/den`                                  | Link the canopy den backing the topic's discussion. Idempotent, first-writer-wins. |
| `POST /arguments`                                       | Post an argument or rebuttal (`parentArgumentId`).                                 |
| `POST /arguments/:id/vote`                              | Up/down vote.                                                                      |
| `GET /verdict/:topicId`                                 | Community winner + consensus diagnostic.                                           |
| `GET /reel`                                             | Cross-topic ranked argument feed (paginated: `limit`/`offset`/`nextOffset`).       |
| `POST /live/sessions`                                   | Start a live session (caller becomes moderator).                                   |
| `GET /live/sessions/:topicId`                           | Active session for a topic, or `null`.                                             |
| `POST /live/sessions/:id/speak`                         | Request to speak.                                                                  |
| `POST /live/sessions/:id/speak/:userId/(grant\|revoke)` | Moderator-gated.                                                                   |
| `POST /live/sessions/:id/(pin\|unpin)`                  | Pin/unpin an argument or citation (moderator-gated).                               |
| `POST /live/sessions/:id/end`                           | End the session (moderator-gated).                                                 |
| `GET /matches`                                          | List matches. `propositionTopicId` filters to one topic's fight.                   |

The match layer (`/matches`, `/shouts`, `/knowledge`, `/briefs`, `/challenges`,
`/leaderboards`) is documented in the route file rather than duplicated here.

Write endpoints are **rate-limited per authenticated user** (topic, argument,
vote, and live mutations each have their own bucket); over the limit returns
`429` with `Retry-After`.

## Persistence

State is held in the shared store
([`packages/api/src/services/coliseumStore.ts`](../../packages/api/src/services/coliseumStore.ts)
→ [`db/store.ts`](../../packages/api/src/db/store.ts)). Topics, arguments, votes,
live sessions, and the reputation event log all persist, so debate history
survives a restart in both `file` and `postgres` modes (`BLACKOUT_DB_MODE`). The
store is synchronous, so route handlers don't need to be async.

Demo seed data (e.g. `topic-grid-resilience`) loads only on an empty store and
only outside production; set `COLISEUM_SEED=1`/`0` to override. Production starts
empty.

## Reputation

Reputation is earned **per subject area** (the topic categories), not as one
global number
([`packages/core/src/reputation/`](../../packages/core/src/reputation/)). An
up-vote endorses the argument's author, credited once per `(voter, argument)`.
Events persist in the store, so per-subject standing (and the dedupe set) survive
a restart. The profile is exposed at `/v1/reputation/:userId` and rendered on the
user profile.

## Live debate transport

Real-time media uses **matrixRTC** (MSC3401/MSC4143), the same transport as the
rest of the platform: `LiveTab` joins via `useCall().joinCall(roomId,
{ mode: 'broadcast' })`, which discovers a LiveKit focus/SFU from
`/.well-known/matrix/client` and obtains its own focus JWT. The Coliseum live
session is the **application control plane**: moderators and granted speakers may
publish (mic/camera), while the audience joins receive-only and is held muted
client-side (a revoked speaker is auto-muted). There is no separate Coliseum
LiveKit token endpoint — the speaking queue, not an SFU token, governs who speaks.

## AI policy

Coliseum is human-centered. AI tooling is confined to AI dens
([`packages/core/src/den/classification.ts`](../../packages/core/src/den/classification.ts));
the `aiToolsEnabled` gate keeps human reasoning and accountable, evidence-driven
debate the default everywhere else.
