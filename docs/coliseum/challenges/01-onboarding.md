# Challenge 01 — Onboarding (under 10 minutes on mobile)

| Field | Value |
|---|---|
| Slug | `01-onboarding` |
| GitHub label | `challenge:onboarding` |
| Aid-post urgency | `high` |
| Primary surface | `surface:mobile` |
| Related docs | [`docs/ia_onboarding_ttfv_under_10m_plan.md`](../../ia_onboarding_ttfv_under_10m_plan.md) |

## The challenge

Sign up for Blackout on a mobile device and send your first message in
**under ten minutes**, including any latency, friction, or "wait, what?"
moments. Use a stopwatch. Note where time goes.

Pass criteria for the challenge itself: TTFV (time to first value, defined
here as "your message visible in `#welcome:theblackout.app`") under
10:00 from "I tap install / open."

If you fail the 10-minute bar, that's the finding. If you succeed, that's
also a finding — note your timing and which device.

## Aid post (paste into the Coliseum's mutual-aid feed)

```json
{
  "type": "need",
  "category": "tech_support",
  "urgency": "high",
  "status": "open",
  "title": "C01 — Sub-10-minute mobile onboarding stress test",
  "body": "Pick a fresh mobile device (or wipe app data). Sign up, reach #welcome:theblackout.app, send a message. Time it. Document every friction point. Brief: docs/coliseum/challenges/01-onboarding.md",
  "metadata": {
    "challengeId": "01-onboarding",
    "githubLabel": "challenge:onboarding"
  }
}
```

## Governance proposal stub

```
Title: Prioritize onboarding fixes (C01 findings) for V1.1
Type: consent (sociocratic default)
Body: |
  Findings from challenge 01 land as GitHub issues with the
  `challenge:onboarding` and `T-Coliseum-Finding` labels. This proposal
  asks: do we commit V1.1 capacity to closing the highest-severity
  subset of these findings before any other Coliseum-derived work?

  Decision rule: consent (no blocking objections from role:operator).
Quorum: 5+ role:operator votes
Deadline: H72
```

## How to claim and report

1. Open the Coliseum Coalition aid post above and tap **Claim**.
2. Set a stopwatch. Start fresh — wipe app data or use a clean device.
3. Sign up via the hosted instance (`matrix.theblackout.app`) on whichever
   mobile platform you have access to.
4. Note timings at: account create, identity verification, first room joined,
   first message sent.
5. File a [Coliseum finding](https://github.com/Blackmarket-coa/blackout/issues/new?template=coliseum-finding.yml).
   Select **01 — Onboarding**. Paste your timings; note one specific
   friction point per finding.

## What a high-signal finding looks like

> Took 14:23 on a fresh Pixel 7 with no prior install. 3:40 lost to the
> identity-verification step (no visible progress indicator while the
> server processed). 2:10 lost looking for the "send first message" entry
> point after landing on the welcome room — the keyboard didn't focus.
> Suggest: progress indicator on verification step, autofocus message input
> on welcome room first load.
