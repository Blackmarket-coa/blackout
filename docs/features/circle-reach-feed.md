# Circle & Reach — the feed, Relay, and what they touch

The feed is built entirely from people choosing to pass things to each other. No
algorithm injects content. If something reached you, a human chain of choices put
it there, and that chain is always visible.

## Glossary — three words that already meant something else

| Term       | Here it means                                                    | Not to be confused with                                                                                                                       |
| ---------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Circle** | Your personal graph ring: the people you follow (`circle_edges`) | `RING_KINDS` includes a coalition ring _kind_ called `circle`, which is a **group** — see `packages/core/src/coalition/coalitionRing.ts`      |
| **Relay**  | The chain-repost, `co.bmc.relay`, `relay_edges`                  | `co.bmc.boost` is the fundraiser/hype-train state event; `communityBoosts` is the paid-pledge flow. UI copy still says "Boost" for the repost |
| **Reach**  | Items relayed inward from beyond your Circle                     | —                                                                                                                                             |

## The two rings

**Circle** — the people you follow. Following builds _your_ Circle and needs no
approval from them. When two people follow each other their circles **overlap**;
that is the only thing "mutual" means here, it is derived from the two edges on
read, and there is no request/accept handshake.

**Reach** — anything an active relay by someone in your Circle carried inward.
Unlimited hops in principle; movement only ever happens because a person relayed.

Ordering is `at` descending and nothing else — no score, no recency blend, no
interest boost, no per-source cap.

## Why the chain is cheap

A relay records _which edge its relayer saw the item through_ (`parentRelayId`),
so a path is a parent-pointer walk rather than a graph search. A parent must
exist before its child, so the structure is a DAG and cycles are impossible.
`MAX_RELAY_CHAIN_DEPTH` (64) is a safety ceiling, not a ranking signal.

## Un-relaying

Visibility asks only whether _some active edge whose relayer is in your Circle_
exists. Withdrawing sets `active = false` and keeps the row, so:

-   people who reached it only through you lose it;
-   a downstream relayer's own edge is still active and keeps it alive for theirs;
-   the withdrawn hop stays in the displayed chain, marked — a chain with a hole in
    it would misrepresent how the item travelled.

## What can be relayed

`RELAY_SUBJECT_SOURCES` covers only server-resolvable subjects: `coalition_feed`,
`coliseum_topic`, `wall_post`, `status`, `marketplace`, `stream`,
`community_asset`.

**Encrypted den/room content is deliberately absent.** The server cannot resolve
a room event for someone outside the room and will not try. Clients hide the
relay affordance on den content rather than letting the call fail.

## Anti-flood without ranking

Consecutive items from one relayer fold into an expandable run. This is
presentation only: order is preserved, nothing is dropped or downweighted, and
expanding shows everything. Reordering or capping a prolific relayer would be
ranking by another name.

## Cold start

There is no carve-out. A new account's feed is empty until they follow someone,
and Coliseum and Market start unlit like everything else. Nothing is injected to
cover the gap — Discover and Challenge Link are the on-ramp, and the Illumination
meter reports the unlit remainder rather than omitting it.

## Surfaces

| Area                              | Where                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| Circle graph                      | `packages/api/src/services/follows.ts`, `routes/circle.ts` (`/v1/follows` is the same router) |
| Relay writes + subject resolution | `packages/api/src/services/relayStore.ts`                                                     |
| Feed assembly                     | `packages/api/src/modules/feed.ts`                                                            |
| Pure helpers                      | `packages/core/src/feed/`                                                                     |
| Event contract                    | `packages/blackout-protocol/src/relay/contracts.ts`                                           |
| Client                            | `apps/blackout-client/src/app/features/circle-feed/`                                          |
| Schema                            | migration `085_circle_and_relays`                                                             |

The existing ranked aggregator (`features/home/unifiedFeedModel.ts`) is untouched
and now serves the **Discover** surface under For You / Following.

## Profile, crews, assets

-   **Profile layout** is an ordered block list with per-block visibility. Hiding
    keeps a block's slot so unhiding restores the arrangement. Every role shares
    the same skeleton (`packages/core/src/profile/blocks.ts`).
-   **Circle map** is opt-in per relationship, and only _overlapping_ circles are
    eligible: an overlap means both people chose the edge. Building a Circle never
    publishes it.
-   **Palettes** are a bounded set unlocked by things done with other people.
    Locked ones are shown as locked with their progress
    (`packages/core/src/profile/palettes.ts`).
-   **Crews** are coalition rings of kind `crew`. `POST /rings/:id/relay-out`
    carries a member's _own_ words out into the network as a published post plus
    their origin relay. Authorship always follows the token, so there is no route
    by which one member publishes another's words.
-   **Assets** (stickers, memes, coins) start `pending` and cannot travel until
    approved. Founding Contributor is the first fifty approved assets of a kind,
    once per creator per kind, with ordinals stamped at approval so a later
    retirement never renumbers anyone.

## Correction to earlier docs

`ProposalEngine` / `VotingEngine` / `DelegatedVotingEngine` appear in
`docs/blackout-governance-*.md` but **do not exist in code**. The shipped
implementation is `packages/api/src/modules/governance.ts` over
`services/governanceStore.ts`, plus `GOVERNANCE_PROPOSAL_EVENT_TYPE` Matrix state
events read by the client.
