# Challenge 06 — Governance vote round-trip

| Field | Value |
|---|---|
| Slug | `06-governance` |
| GitHub label | `challenge:governance` |
| Aid-post urgency | `medium` |
| Primary surface | `area:governance`, `area:coalition` |
| Related docs | [`packages/core/src/governance/`](../../../packages/core/src/governance/) |

## The challenge

Vote on the **priority-order governance proposal** seeded in the Coliseum
Coalition at launch. Then verify three things:

1. Your vote was recorded (visible in your account state, not just locally
   cached).
2. The tally on the proposal updates to reflect your vote within ~10s.
3. If you change your vote (where the proposal type allows), the tally
   adjusts.

Edge: cast a vote, force-reload the client, confirm the vote persisted.

## Aid post

```json
{
  "type": "need",
  "category": "tech_support",
  "urgency": "medium",
  "status": "open",
  "title": "C06 — Cast and verify a governance vote",
  "body": "Vote on the priority-order proposal in the Coliseum. Verify recording, tally update, and persistence across reload. Brief: docs/coliseum/challenges/06-governance.md",
  "metadata": {
    "challengeId": "06-governance",
    "githubLabel": "challenge:governance"
  }
}
```

## Governance proposal stub (this one is the SEED proposal at launch)

```
Title: Priority order for V1.1 Coliseum-finding work
Type: ranked
Body: |
  Rank the eight challenges in the order V1.1 should address their
  highest-severity findings. The result feeds docs/launch/V1.1_ROADMAP.md
  as the community-priority input.

  Choices (rank from 1 to 8):
    - Onboarding (C01)
    - Voice (C02)
    - Mobile media (C03)
    - Federation (C04)
    - Stego (C05)
    - Governance (C06)
    - Performance (C07)
    - Deaddrop (C08)
Quorum: 20+ votes
Deadline: H72
```

This is the **only** proposal that is BOTH a challenge prompt AND a real
governance instrument. Challenges 1, 2, 3, 4, 5, 7, 8 each have their own
proposal stubs, but they're separate from the priority-order seed.

## How to claim and report

1. Claim the aid post.
2. Open the priority-order proposal in the Coliseum's chat tab (or
   wherever proposals render in your client).
3. Cast a ranked vote.
4. Verify (a) tally updates, (b) your vote shows as cast, (c) force-reload
   and reconfirm.
5. If the proposal type allows it, change your vote and verify the tally
   re-tallies.
6. File a [Coliseum finding](https://github.com/Blackmarket-coa/blackout/issues/new?template=coliseum-finding.yml).

## What a high-signal finding looks like

> Cast ranked vote at H06:14. Tally updated within 2s. Force-reload at
> H06:15 — vote still showed as cast, but the visible tally dropped my
> vote until I clicked into the proposal detail view, after which it
> reappeared. Suggests tally cache is per-view, not invalidated on
> mount.

## Why this is a high-value challenge

If governance doesn't work, the Coalition primitive doesn't work as
designed. The priority-order proposal is also the **most important input**
into V1.1 planning — testers casting votes here are literally setting the
roadmap.
