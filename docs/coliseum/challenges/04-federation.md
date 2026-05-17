# Challenge 04 — Federation join

| Field | Value |
|---|---|
| Slug | `04-federation` |
| GitHub label | `challenge:federation` |
| Aid-post urgency | `high` |
| Primary surface | `area:federation`, `surface:server` |
| Related docs | [`docs/operations/runbooks/independent-org-to-coalition-onboarding.md`](../../operations/runbooks/independent-org-to-coalition-onboarding.md) |

## The challenge

Sign up on a homeserver **other than** `matrix.theblackout.app`, join the
Coliseum Coalition, and:

1. Send a message in the Coalition's chat tab.
2. Claim a different challenge's aid post.
3. Vote on the priority-order proposal.

If any of those three actions fails or is materially delayed across the
federation hop, that's the finding.

You can either stand up your own peer homeserver (see the onboarding
runbook) or use an existing federated homeserver that's already coalition-
joined.

## Aid post

```json
{
  "type": "need",
  "category": "tech_support",
  "urgency": "high",
  "status": "open",
  "title": "C04 — Federation: join Coliseum from non-Blackout homeserver",
  "body": "Sign up on a peer homeserver. Join the Coliseum. Send a message, claim a different aid post, vote on the priority proposal. Note federation latency at each step. Brief: docs/coliseum/challenges/04-federation.md",
  "metadata": {
    "challengeId": "04-federation",
    "githubLabel": "challenge:federation"
  }
}
```

## Governance proposal stub

```
Title: Federation partner listing in V1.1
Type: consent
Body: |
  Peer homeservers that held federation cleanly for 48+ hours during the
  test flight are listed as official federation partners in V1.1. This
  proposal asks role:operator to consent to that listing pattern as the
  standing recognition mechanism for the federation-team role.
Quorum: 5+ role:operator votes
Deadline: H84
```

## How to claim and report

1. Claim the aid post.
2. Either:
   - **Stand up your own peer homeserver** per the onboarding runbook
     (this is also the claim for the Federation Team role — see
     [`CONTRIBUTOR_ROLES.md`](../../../CONTRIBUTOR_ROLES.md))
   - **Or use an existing federated homeserver** if one of the Federation
     Team has already stood theirs up — coordinate in
     [`#blackout-dev:theblackout.app`](https://matrix.to/#/#blackout-dev:theblackout.app)
3. Perform the three actions (message, claim, vote). Time each.
4. File a [federation bug](https://github.com/Blackmarket-coa/blackout/issues/new?template=bug-federation.yml)
   for any failure, OR a [Coliseum finding](https://github.com/Blackmarket-coa/blackout/issues/new?template=coliseum-finding.yml)
   with timings if all three worked.

## What a high-signal finding looks like

> Stood up Synapse 1.99 at peer.example. Joined Coliseum (alias
> #coliseum:matrix.theblackout.app) — completed in 3s. Sent message, visible
> on the originating side immediately, visible on matrix.theblackout.app
> after 1.4s. Claimed C03 aid post — claim state propagated to
> matrix.theblackout.app after 2.1s. Vote on priority proposal cast at
> H24:03 from peer, tally on hosted side updated at H24:08 — 5-second
> delay. No errors. Federation pathway looks healthy.

## Why this challenge is high-urgency

A federated platform that nobody federates with is not a federated
platform. Demonstrating real peer-to-peer federation during the test flight
is the single most important credibility signal for the V1 launch.
