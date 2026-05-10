# FBM Entitlements Service — Blackout consumer contract

Status: **draft / consumer-side stub**. This document captures the
shape of the FBM Entitlements Service that Blackout-side code expects
to consume. The canonical OpenAPI specification lives (or will live) in
the FBM repository at `docs/contracts/entitlements.yaml` per
`docs/AGGRESSIVE_OPERATIONS_GUIDE.md` §2.5. This file is the
Blackout-side mirror: it narrows the contract to the slice Blackout
needs and pins the TypeScript shapes that Blackout code targets.

When the FBM-side OpenAPI specification ships, this document is
reconciled against it and the TypeScript surface in
`packages/api/src/integrations/fbm/entitlementsContract.ts` is updated
in lockstep.

## Why this document exists separately from the FBM OpenAPI

Two reasons:

1. The FBM Entitlements Service is not yet exposed over HTTP. AOG §2.5
   commits to it as Foundation milestone work; the Blackout-side
   consumers (Coalition Credits balance widget, governance UI) are also
   Foundation milestone rows in §9.2. Without a consumer-side surface
   to code against, the Blackout-side rows stay blocked on FBM-side
   work.
2. Consumers are entitled to a narrower view than the canonical
   specification. The FBM OpenAPI document covers FBM-internal callers
   too (settlement engine, governance module, payout breakdown
   workers). Blackout only consumes the four read-side questions
   identified in §2.5. Pinning the consumer slice prevents speculative
   coupling to FBM-internal endpoints that may change.

## The four questions

AOG §2.5 specifies that the entitlements contract answers four
questions for a `(MXID, resource)` pair. Blackout-side consumers
target the read-side of all four.

### Question 1 — Access

> Does this user have permission to read, write, or administer this
> resource?

Blackout consumers: cooperative governance UI (admin-only proposal
actions), Coalition Credits widget (the balance is only visible to the
account holder), federated room ACL gates that mirror coalition
membership.

Resources are addressed by URN. The URN namespace covers:

- `urn:fbm:room:<matrix-room-id>` — Matrix room (read/write/admin)
- `urn:fbm:listing:<listing-id>` — marketplace listing
- `urn:fbm:proposal:<proposal-id>` — governance proposal
- `urn:fbm:fulfillment-node:<node-id>` — fulfillment node operations
- `urn:fbm:ledger-tx:<tx-id>` — ledger transaction
- `urn:fbm:platform:admin` — platform administration

Actions are `read | write | administer`.

### Question 2 — Economic standing

> What is this user's Coalition Credits balance, what payout balances
> are pending for them, what vendor sales volume have they generated,
> and what creator reward eligibility do they hold?

Blackout consumers: Coalition Credits balance widget, donation rails
panel (Differentiation milestone), creator-rewards UI affordances on
the storefront.

The response is structured to drive payout breakdowns, dunning logic,
and reward calculations. Blackout consumes the read-only summary; it
does not adjust balances. Mutations go through the FBM-side
`hawala-ledger` and `payout-breakdown` modules.

### Question 3 — Governance roles

> What roles does this user hold within which coalitions, what
> governance proposals can they vote on, what Matrix ACLs follow from
> their roles, and what FBM commerce permissions follow from their
> roles?

Blackout consumers: cooperative governance UI (which proposals show a
vote affordance), Matrix ACL sync worker (room power levels follow
governance roles).

The Matrix ACLs returned here are the canonical source for the ACL
sync worker. Blackout does not re-derive them from coalition
membership; it applies what the entitlements service returns.

### Question 4 — Coalition membership

> Which coalitions does this user belong to, what is their membership
> status, and what coalition-specific entitlements follow from
> membership?

Blackout consumers: spatial layer integration (coalition layer
membership gates), DeepDive room discovery (coalition rooms in the
swipe stack), invite UX in the linked-accounts surface.

## Endpoint surface (consumer slice)

All endpoints are GET. All take `mxid` as a path parameter (URL-encoded
Matrix MXID e.g. `%40alice%3Aexample.org`). All return JSON. All require
the standard FBM service-to-service auth header documented separately.

| Path | Question | Returns |
|------|----------|---------|
| `/v1/entitlements/access/:mxid?urn=<urn>&action=<action>` | Q1 | `{ allowed: boolean, source: string }` |
| `/v1/entitlements/economic-standing/:mxid` | Q2 | `EconomicStanding` |
| `/v1/entitlements/governance-roles/:mxid` | Q3 | `{ roles: GovernanceRole[] }` |
| `/v1/entitlements/coalitions/:mxid` | Q4 | `{ memberships: CoalitionMembership[] }` |

Two batch endpoints support the dashboard render path so the widget
load doesn't require four sequential round trips:

| Path | Combines |
|------|----------|
| `/v1/entitlements/summary/:mxid` | Q2 + Q3 + Q4 in a single response |
| `/v1/entitlements/access-batch/:mxid` body: `{ checks: { urn, action }[] }` | Q1 in batch |

TypeScript shapes for `EconomicStanding`, `GovernanceRole`, and
`CoalitionMembership` are pinned in
`packages/api/src/integrations/fbm/entitlementsContract.ts`.

## Caching, timeouts, error handling

These are consumer-side conventions and are not part of the FBM
service contract — they live here so Blackout-side callers behave
consistently.

- **Cache-control**: responses include `Cache-Control: max-age=N` from
  FBM. Blackout respects this. The `summary` endpoint is expected to
  carry a short TTL (≤30 s) because Coalition Credits balance updates
  must surface promptly after settlement events.
- **Timeout**: 5 s default. Calls over the timeout are recorded as
  failures and the consumer falls back to a stale cached value if one
  exists, otherwise renders the "entitlements unavailable" empty state.
- **Retry**: idempotent GETs may be retried up to 2 times with
  exponential backoff (250 ms, 1 s). Batch endpoints are not retried
  because the failure mode is more often "FBM is slow" than "transient
  network blip" and a retry compounds load.
- **Auth failures**: 401/403 are surfaced as a hard error to the UI;
  the user is signed out of the Blackout session as a safety measure
  because the MXID-keyed entitlements lookup must remain consistent
  with the active Blackout session.
- **Service unavailable**: 5xx responses fall through to the cached
  value or empty state and emit `fbm_entitlements_unavailable_total`
  on the Blackout-side Prometheus exporter.

## Roadblock and reconciliation

The roadblock to full consumer wiring is the FBM-side OpenAPI
specification. Until that ships:

- `packages/api/src/integrations/fbm/entitlementsContract.ts` defines
  the TypeScript interfaces but does not bundle a runtime client
  implementation.
- Blackout-side consumers (Coalition Credits widget, governance UI)
  target the interface and use a stub fixture in dev/test until the
  FBM service is reachable.
- When the FBM OpenAPI specification ships, it is reconciled against
  this document. Differences are resolved on the FBM side if they are
  contract-level; on the Blackout side if they are
  consumer-convention-level (caching, retry).

Cross-references:

- `docs/AGGRESSIVE_OPERATIONS_GUIDE.md` §2.5 — contract definition.
- `docs/AGGRESSIVE_OPERATIONS_GUIDE.md` §9.2 — Coalition Credits
  balance widget and Cooperative governance UI rows that depend on
  this contract.
- `packages/api/src/integrations/fbm/entitlementsContract.ts` —
  TypeScript surface.
