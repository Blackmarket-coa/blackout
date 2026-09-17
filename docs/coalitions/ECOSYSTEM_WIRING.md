# Coalitions — ecosystem wiring

How a coalition on Blackout reaches the rest of the ecosystem, and the
decisions behind each seam. Companion to `TASK0_AUDIT.md`, which records what
already existed.

Four repos are involved and each owns exactly one thing:

| Repo            | Owns                                              |
| --------------- | ------------------------------------------------- |
| Blackout        | coalitions, memberships, roles, campaigns, boosts |
| FreeBlackMarket | commerce, reputation (KARMA), ordering windows    |
| Blackstar       | physical fulfilment                               |
| blackmask       | untouched by this feature                         |

Nothing is co-owned. Where two systems need the same fact, one pushes it to the
other rather than both writing it.

## The money invariant

Coalition-driven commerce pays 3%, and never more. That is a **ceiling**, not a
pin: a seller who pays for an FBM plan is charged 2.5 / 2 / 1.5%, and a
coalition drive on their listing is charged what they are charged. What is
invariant is the direction and the reason — a discount is bought with a
subscription the seller already pays for, and is never earned by a coalition's
size, its KARMA, or its standing.

`services/coalitionDrives.ts` enforces it at the point of use:

```ts
export const COALITION_COMMISSION_BPS = 300; // the standard rate AND the ceiling
assertFlatCommission(); // throws if the fee table rises above it
const bps = await quoteCommissionBps(listingId); // null when FBM quotes above the ceiling
```

The audit found 3% is a _default_ in FBM, and the first implementation read that
as a threat: it asserted the table still said exactly 300 and passed no
per-listing rate, so a contributor to a drive whose seller pays $99/month was
shown 3% while FBM took 2%. The displayed split has to be the charged split, so
the rate is now quoted per listing and baked into the tip's cents — the tip is
the obligation, and re-deriving the split later would let the two disagree.

A quote **above** the ceiling is refused, not clamped. Clamping the display down
to 3% while the marketplace takes more would turn the number a contributor
agreed to into a lie, so `startContribution` takes its existing "record nothing,
say so" branch with reason `commission_above_ceiling`. A quote that cannot be
fetched at all falls back to the standard rate: an outage at FBM must not stop
people funding a drive.

## Reputation: one ladder, flat deltas

Coalition activity earns KARMA on the same soulbound ladder as everything else,
through the same single write path (`ProgressionModuleService.recordXpEvent` →
the canonical `karma_event` log).

**Blackout says what happened; FBM decides what it is worth.** The delta table
lives at `backend/src/modules/progression/coalition-karma.ts` and is never
taken from the caller, so a compromised or buggy Blackout process cannot mint
reputation — only describe events.

| Event                  | Delta | Credited to                                  |
| ---------------------- | ----- | -------------------------------------------- |
| `coalition_founded`    | 10    | founder                                      |
| `member_joined`        | 2     | the member, keyed on the membership row      |
| `drive_completed`      | 25    | the drive's organiser, not whoever closed it |
| `drive_contributed`    | 5     | contributor, keyed on the tip id             |
| `mutual_aid_fulfilled` | 15    | organiser                                    |
| `aid_raised`           | 3     | the member who raised it                     |
| `project_delivered`    | 20    | organiser                                    |
| `quest_completed`      | 30    | awarded FBM-side                             |

### Legal review: checked, and the condition that would change the answer

`progression/thresholds.ts` requires reputation and capital to stay
structurally separate: _"preferential access to an offering conditioned on
prior investment is a distribution practice, not a loyalty perk."_

Coalition KARMA satisfies this today, and the reasons are the things to watch:

1. **Every delta is flat.** A drive that raises $50,000 earns exactly what a
   drive that raises $500 earns. The award records that the group did the
   thing, not how much money moved. An award proportional to dollars would be a
   rebate — the pattern flagged for review.
2. **Nothing awarded here is priced.** No coalition award moves a commission
   rate, a price, or access to an offering.

So no legal review is triggered by this change. **If Coalition KARMA ever
touches pricing or commission — a rate that varies by tier, a coalition-only
price, an allocation conditioned on prior contribution — stop and get legal
review before shipping.** The constraint is restated inline in
`coalition-karma.ts` so the next person editing that table sees it.

### Still open, from the audit

Physical-goods drives may intersect the barter/exchange mechanics already
flagged for IRS Form 1099-B review in FBM. That gate exists in
`docs/COMMERCE_ROADMAP.md` but is absent from the canonical §8 gate list, so
whether it binds is a human call. **Goods drives are flagged for the same
review rather than assumed exempt** — see `TASK0_AUDIT.md`'s decision log.

## Boost pooling: a separate pool, by decision

Coalition Boost draws from a **separate pool**, not from members' personal
caps. One boost per member, per campaign, per UTC day, with a per-coalition
daily allowance (`COALITION_BOOST_DAILY_ALLOWANCE`, default 3).

It never reads Community Boost pledges (which are money) or Circle relays, so
nothing is double-counted in either direction. Amplification reuses the
existing project-Surge Laplace acceleration rather than inventing a second
multiplier:

```ts
surgeFactor = (last24h + 1) / (last24h + prev24h + 2);
```

## Commerce: the collective storefront

`GET /store/coalitions/:coalitionId/storefront` aggregates member shops under
one public, cacheable view.

A coalition's FBM face is a `cooperative` row carrying `blackout_coalition_id`.
Member shops resolve through `cooperative_member.seller_id` — **not**
`producer_id`, which receives a customer actor id on the store join path and a
producer row id on the seller launch path, and therefore cannot resolve a
catalog at all. `seller_id` was added for this reason.

A catalog failure degrades to the member list rather than a 500: the coalition
page is still useful without the grid.

## Shared ordering windows

A coalition's shared batch-ordering window **is an order cycle** — same
open/close/dispatch timing, same exchanges, same fee engine, same customer
surface every food hub already uses. What the new route adds is the membership
projection the audit found nothing was writing: every coalition member with a
shop becomes a participating producer with an incoming exchange.

`POST /v1/integrations/blackout/coalitions/:id/order-cycles`

-   Idempotent on `campaign_id`, backed by a unique partial index — a retried
    launch reuses the window and re-seats anyone who joined since.
-   Rejects `opens_at >= closes_at` or `dispatch_at < closes_at`.
-   Refuses to open a window no member can supply (`no_member_shops`) rather than
    showing customers a storefront they cannot order from.
-   Blackout opens the window from **every** path that reaches `active`
    (steward-created, approved, explicitly transitioned) — a steward's campaign is
    born active and never passes through a transition.

A goods drive with no end date opens no window: a window with no close never
dispatches, and inventing a close date on the coalition's behalf is worse than
leaving it to them.

## Milestones: absolute totals, never increments

`PUT /v1/integrations/blackout/coalitions/:id/milestones` mirrors a coalition's
joint-drive totals onto its cooperative, where the coalition quest reads them.

A PUT of absolute totals rather than a POST of increments, deliberately:
Blackout owns the drives and can always recompute the true count, so a lost or
duplicated delivery self-heals on the next push. An increment API would drift
permanently on a single retry.

Counts and cents only. Who contributed and how much stays on Blackout — FBM
needs the shape of a coalition's effort to open a gate, not its members' giving
history.

## The coalition-only quest (Q16)

`coalition-drive` is the first quest no single vendor and no ad-hoc collective
can complete. Every gate reads `collective.coalition`, a domain-optional
substrate field populated only when the collective is the FBM face of a
Blackout coalition — so the engine learns nothing about coalitions and the
definition is the only thing that reads it.

The milestone is **joint**, not cumulative-individual: `contributing_members`
counts distinct contributors, so a drive one member funded alone does not open
the gate. The point of a coalition drive is that the coalition showed up.

No packet: like Q10 and Q13 this is an internal unlock. There is no outside
gatekeeper to submit a coalition drive to, and pretending otherwise would put
FBM's name on a document nobody asked for.

## Physical fulfilment: Blackstar

A coalition goods drive that needs freight arrives on the same shipment board
as every other job — no parallel board, no second claim mechanic.

-   `shipment_board_listings.coalition_ref` / `.drive_ref` carry the origin.
-   `ShipmentEligibilityService` narrows a listing carrying a `coalition_ref` to
    nodes holding an active membership of it, so the reverse auction runs _among
    coalition members_. A listing with no `coalition_ref` — every ordinary
    delivery — is unaffected.
-   `node_coalition_memberships` maps nodes to coalitions. A pivot, because a
    haulier can serve several coalitions and picking one would force operators to
    choose.
-   **Award authority is widened, narrowly.** A drive that arrives from FBM is
    owned by the FBM service account, which is not a person and will never log
    in, so its bids could be placed and never awarded — the auction would collect
    prices and stall. A coalition's coordinator may award listings carrying that
    coalition's ref, and nothing else. It grants the same single act the poster
    already had.

## External sync sequencing

Two-way sync stays dark until inbound moderation is in place; the gates are
`BLACKOUT_COALITION_CROSSPOST_ENABLED` (outbound) and
`BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED` (inbound), both off by default.

-   Nothing broadcasts without explicit per-campaign, per-platform, per-member
    opt-in. There is no auto-enrolment of personal accounts.
-   Everything inbound lands `pending` and is invisible until moderated.
-   External reply authors are never Blackout users: they are rendered as
    `"Ada via Discord"` with no profile, no permissions, and no account implied.

## Failure posture

Every cross-repo push is fire-and-forget and never blocks the coalition action
that triggered it. An FBM outage costs a reputation award or a mirrored total,
not a drive. Replay safety comes from deterministic keys, not from delivery
guarantees:

| Push         | Replay key                                      |
| ------------ | ----------------------------------------------- |
| reputation   | `(source_module, source_id)` at FBM's karma log |
| milestones   | absolute totals; last write wins                |
| order window | `campaign_id`, unique-indexed                   |
| contribution | `tip_id`, unique-indexed                        |
