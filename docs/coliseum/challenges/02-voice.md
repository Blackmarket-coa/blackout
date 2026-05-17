# Challenge 02 — Voice call across two networks

| Field | Value |
|---|---|
| Slug | `02-voice` |
| GitHub label | `challenge:voice` |
| Aid-post urgency | `high` |
| Primary surface | `area:voice-video`, `area:livekit` |
| Related docs | [`THREAT_MODEL.md`](../../../THREAT_MODEL.md) §3 boundary 3 |

## The challenge

Hold a 1:1 voice call with another tester for **5+ minutes**, with each
side on a **different network** (e.g. your Wi-Fi ↔ their cellular). Report
audio quality, dropouts, reconnect behavior, and whether the media-
encryption indicator stayed in its expected state for the full call.

Bonus rounds:
- Repeat with screen-share enabled
- Repeat with a 3rd participant joining mid-call
- Repeat after one side intentionally switches networks during the call

## Aid post

```json
{
  "type": "need",
  "category": "tech_support",
  "urgency": "high",
  "status": "open",
  "title": "C02 — Cross-network voice call (5+ minutes)",
  "body": "Pair with another tester on a different network. Hold a 1:1 voice call for 5+ minutes. Note any audio gaps, reconnects, codec messages, or media-encryption indicator changes. Brief: docs/coliseum/challenges/02-voice.md",
  "metadata": {
    "challengeId": "02-voice",
    "githubLabel": "challenge:voice"
  }
}
```

## Governance proposal stub

```
Title: V1.1 commitment to LiveKit call reliability work
Type: binary (yes / no)
Body: |
  Findings from challenge 02 measure baseline call reliability. If the
  finding density crosses a threshold (5+ severity:high issues), commit
  to a V1.1 LiveKit reliability workstream before any new call features.
Quorum: 8+ votes
Deadline: H84
```

## How to claim and report

1. Claim the aid post in the Coliseum.
2. Find a partner on a different network — coordinate in
   `#welcome:theblackout.app`.
3. Start the call. One side: stay on it for 5 minutes. Note timestamps for
   any audio gap > 500ms, any reconnect, any indicator state change.
4. After the call ends, file a [voice/video bug](https://github.com/Blackmarket-coa/blackout/issues/new?template=bug-voice-video.yml)
   per distinct issue, OR a [Coliseum finding](https://github.com/Blackmarket-coa/blackout/issues/new?template=coliseum-finding.yml)
   if the call worked end-to-end (positive findings count too).

## What a high-signal finding looks like

> Call held 7:34. Two audio gaps at 2:14 (≈900ms, called side) and 5:08
> (≈400ms, calling side). Caller switched Wi-Fi → cellular at 4:30; reconnect
> took 6 seconds with no on-screen indication other than the existing
> audio gap. Media-encryption indicator stayed green the entire time.
> Codec: opus 48kHz. Both parties on web Blackout, latest build.

## What this challenge tells us about THREAT_MODEL.md

Boundary 3 (media encryption) is where the SFrame E2EE work is post-beta —
during the test flight, the boundary documents what we model and what we
don't. If your call held but the indicator flickered or changed state mid-
call, that's a finding worth filing even if audio was fine.
