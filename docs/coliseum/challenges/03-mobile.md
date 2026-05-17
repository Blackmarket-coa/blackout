# Challenge 03 — Mobile media round-trip

| Field | Value |
|---|---|
| Slug | `03-mobile` |
| GitHub label | `challenge:mobile` |
| Aid-post urgency | `medium` |
| Primary surface | `surface:mobile`, `surface:web` |
| Related docs | [`KNOWN_LIMITATIONS.md`](../../../KNOWN_LIMITATIONS.md) §"Notification click-to-room routing" |

## The challenge

Send media from one mobile platform, verify it arrives intact on the other,
and verify it also arrives intact on web. Specifically:

1. Send a **photo** from iOS to Android (or vice versa).
2. Send a **voice note** in the opposite direction.
3. Open the same room on the web client. Verify both items render
   correctly: photo at full resolution, voice note plays.

Report: any rendering glitches, dimension mismatches, audio truncation,
notification arrival behavior, or thumbnail issues.

## Aid post

```json
{
  "type": "need",
  "category": "tech_support",
  "urgency": "medium",
  "status": "open",
  "title": "C03 — Cross-platform media round-trip (iOS / Android / web)",
  "body": "Photo + voice note iOS ↔ Android. Verify both arrive intact on the third surface (web). Brief: docs/coliseum/challenges/03-mobile.md",
  "metadata": {
    "challengeId": "03-mobile",
    "githubLabel": "challenge:mobile"
  }
}
```

## Governance proposal stub

```
Title: Mobile parity gate for V1.1
Type: multiple_choice
Body: |
  Findings from challenge 03 establish whether mobile-to-mobile-to-web
  media round-trip is reliable enough to call "parity." Choose the bar
  for V1.1:
    A. 95% round-trip success across 10 unique device pairs
    B. 99% round-trip success across 20 unique device pairs
    C. No quantitative bar — qualitative judgement by role:operator team
Quorum: 8+ votes
Deadline: H84
```

## How to claim and report

1. Claim the aid post.
2. You need access to both iOS and Android, or pair with someone who has
   the other side.
3. Run the three steps (photo, voice note, web verify). Take screenshots
   of any rendering mismatch.
4. File a [mobile bug](https://github.com/Blackmarket-coa/blackout/issues/new?template=bug-mobile.yml)
   per distinct defect, OR a [Coliseum finding](https://github.com/Blackmarket-coa/blackout/issues/new?template=coliseum-finding.yml)
   for the round-trip outcome.

## What a high-signal finding looks like

> iPhone 14 (Capacitor build 142) → Pixel 7 (Capacitor build 142) → web
> (latest develop): Photo arrived rotated 90° on Android, correct on web.
> Voice note had ~200ms silent prefix on Android and on web (matches), no
> issue on the originating iPhone. Thumbnail showed loading spinner for
> ~4s on Android before resolving.

## Why this is a Coliseum challenge

Mobile is where most testers come in. Cross-surface parity is what proves
"federated and platform-portable" rather than "web-only with mobile
companion." A finding density here is one of the V1.1 priority signals.
