# Challenge 08 — Deaddrop round-trip

| Field | Value |
|---|---|
| Slug | `08-deaddrop` |
| GitHub label | `challenge:deaddrop` |
| Aid-post urgency | `low` |
| Primary surface | `area:deaddrop`, `area:e2ee` |
| Related docs | [`THREAT_MODEL.md`](../../../THREAT_MODEL.md) adversary class A9, [`docs/security/deaddrop-pq-hybrid.md`](../../security/deaddrop-pq-hybrid.md) |

## The challenge

Send a deaddrop message, have the recipient retrieve it, and verify (where
the UI surfaces it) that the message was wrapped in the post-quantum hybrid
envelope (X25519 + ML-KEM-768).

Stretch goal: verify that a retrieval attempt by a third party (an account
that wasn't the intended recipient) fails cleanly with no information leak
beyond "not for you."

## Aid post

```json
{
  "type": "need",
  "category": "tech_support",
  "urgency": "low",
  "status": "open",
  "title": "C08 — Deaddrop send → retrieve → verify PQ-hybrid envelope",
  "body": "Send a deaddrop. Recipient retrieves it. Verify the PQ-hybrid envelope per THREAT_MODEL.md A9. Stretch: confirm a non-recipient gets a clean denial. Brief: docs/coliseum/challenges/08-deaddrop.md",
  "metadata": {
    "challengeId": "08-deaddrop",
    "githubLabel": "challenge:deaddrop"
  }
}
```

## Governance proposal stub

```
Title: V1.1 deaddrop UX visibility
Type: binary
Body: |
  Findings from challenge 08 will tell us whether testers can find
  evidence that the deaddrop envelope is PQ-hybrid (the cryptographic
  property they're being asked to trust). Should V1.1 add a first-class
  "envelope inspector" UI affordance so testers and researchers can
  verify the property without reading source?
Quorum: 8+ votes
Deadline: H84
```

## How to claim and report

1. Claim the aid post.
2. Pair with another tester. One sends a deaddrop; the other retrieves.
3. Note: what UI affordance (if any) shows the envelope's cryptographic
   properties to either party.
4. Stretch: a third tester (uninvolved) attempts to retrieve. Note the
   denial behavior — does it differ from "message doesn't exist"? Either
   answer is fine; we just want to know which.
5. File a [Coliseum finding](https://github.com/Blackmarket-coa/blackout/issues/new?template=coliseum-finding.yml)
   with what you observed.

## What a high-signal finding looks like

> Sent a 64-byte deaddrop from tester-A to tester-B at H40:12. Tester-B
> retrieved at H40:13 — content matched, retrieval marked the deaddrop
> as fulfilled. No UI affordance visible to confirm the envelope was
> PQ-hybrid: had to check developer console for the algorithm field. A
> non-recipient (tester-C) attempted retrieval and got "no message
> available," which is indistinguishable from a genuine miss. Could be
> intentional (privacy-preserving denial) or a UX gap depending on the
> threat model.

## Why this challenge is low-urgency

Not because deaddrop matters less — but because the property under test
(PQ-hybrid envelope) is cryptographic, not behavioral. Most findings here
will be UX-affordance findings ("I can't see the property I'm being asked
to trust"), which are real but unlikely to block V1. The crypto property
itself is exercised by the existing unit tests, not by the test-flight
testers.
