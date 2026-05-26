# Coliseum — the discourse feature

Coliseum is Blackout's structured public-reasoning layer: a video-first,
mobile-first way to turn arguments into organized, evidence-driven participation
instead of comment-war chaos. This document covers the standalone discourse
module (distinct from the launch test-flight Coalition described in
[`README.md`](./README.md)).

## Surfaces

The feature renders as a tab shell (`co.bmc.coliseum` state event,
`COLISEUM_TABS`) with five tabs
([`apps/blackout-client/src/app/features/coliseum/`](../../apps/blackout-client/src/app/features/coliseum/)):

- **Topics** — debate topics ranked by "debate heat" (recency × velocity), each
  anchored to a news source.
- **Debate** — structured arguments under a topic, threaded into rebuttal chains,
  with a composer (stance + body + optional short video) and a community verdict.
- **Reel** — a vertical, swipe-to-vote video reel. Swipe right = agree, left =
  disagree, scroll up = next/neutral. With a topic selected it plays that topic's
  arguments; with none selected it plays a **cross-topic** reel that paginates as
  you scroll.
- **Live** — a live debate session for the topic (see Transport below).
- **Sources** — the citations attached across a topic's arguments.

## Data model

Core types live in
[`packages/core/src/coliseum/`](../../packages/core/src/coliseum/):

- **Topic** (`feed.ts`) — title, news anchor, tags, category, status
  (`emerging → active → closing → archived`), and denormalized
  `recencyScore`/`velocityScore`/`debateHeat`.
- **Argument** (`feed.ts`) — `stance` (`for`/`against`/`nuance`), `stanceWeight`,
  body, citations, optional video `media`, an optional `parentArgumentId` (the
  rebuttal link), and denormalized `voteScore` (Wilson lower bound) +
  `nuanceScore` (cross-cluster consensus).
- **Vote** (`feed.ts`) — one per `(argument, voter)`; a re-vote overwrites.
- **Citation** (`citations.ts`) — a discriminated union (`live`, `townhall`,
  `subscription`, `audio`, `article`, `proposal`) that composes existing
  Blackout surfaces.
- **Live session** (`live.ts`) — a topic-keyed room with a moderator-gated
  speaking queue and pinned evidence; pure immutable transition helpers.

### Ranking & consensus

`scoreColiseumArgument` blends votes, recency, citation depth, stance balance,
and consensus. `deriveColiseumWinnerVerdict` ports the Polis model
(`consensus.ts`): voters are k-means-clustered and an argument's consensus is the
*minimum* agree-rate across clusters, so a broadly-acceptable argument can win
without dominating any one faction. `buildColiseumArgumentTree` folds the flat
argument list into rebuttal threads client-side. `rankCrossTopicArguments`
heat-blends arguments across topics for the global reel.

## API

Routes are mounted at `/v1/coliseum`
([`packages/api/src/routes/coliseum.ts`](../../packages/api/src/routes/coliseum.ts)):

| Method & path | Purpose |
|---|---|
| `GET /topics` | List topics (filter by canopy/den/category/tag/status). |
| `GET /topics/:id` | Topic + its ranked arguments. |
| `POST /topics` | Create a topic. |
| `POST /arguments` | Post an argument or rebuttal (`parentArgumentId`). |
| `POST /arguments/:id/vote` | Up/down vote. |
| `GET /verdict/:topicId` | Community winner + consensus diagnostic. |
| `GET /reel` | Cross-topic ranked argument feed (paginated: `limit`/`offset`/`nextOffset`). |
| `POST /live/sessions` | Start a live session (caller becomes moderator). |
| `GET /live/sessions/:topicId` | Active session for a topic, or `null`. |
| `POST /live/sessions/:id/speak` | Request to speak. |
| `POST /live/sessions/:id/speak/:userId/(grant\|revoke)` | Moderator-gated. |
| `POST /live/sessions/:id/(pin\|unpin)` | Pin/unpin an argument or citation (moderator-gated). |
| `POST /live/sessions/:id/end` | End the session (moderator-gated). |

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
