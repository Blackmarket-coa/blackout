# Challenge 07 — Mobile scroll performance

| Field | Value |
|---|---|
| Slug | `07-performance` |
| GitHub label | `challenge:performance` |
| Aid-post urgency | `medium` |
| Primary surface | `surface:mobile`, `area:performance` |
| Related docs | (none — this is a measurement challenge, not a feature challenge) |

## The challenge

Scroll a room with **500+ messages** on mobile and measure FPS. Compare
the FPS during fast flick scroll, slow drag scroll, and over a moderate
section vs. through media-heavy sections.

Use the platform's developer tools where you can:

- **Android:** Developer Options → Show GPU rendering profile (visualizes
  per-frame render time) or `adb shell dumpsys gfxinfo`.
- **iOS:** Xcode Instruments → Core Animation; Safari Web Inspector →
  Timelines (if you're on the web client in mobile Safari).
- **Failing all of the above:** record a screen video at 60fps and count
  visible stutter frames.

## Aid post

```json
{
  "type": "need",
  "category": "tech_support",
  "urgency": "medium",
  "status": "open",
  "title": "C07 — Mobile scroll FPS at 500+ message backlog",
  "body": "Scroll a long backlog on mobile. Measure FPS. Compare across sections. Brief: docs/coliseum/challenges/07-performance.md",
  "metadata": {
    "challengeId": "07-performance",
    "githubLabel": "challenge:performance"
  }
}
```

## Governance proposal stub

```
Title: V1.1 performance budget — mobile scroll
Type: multiple_choice
Body: |
  Findings from challenge 07 give us empirical FPS data. Choose the
  V1.1 target:
    A. Sustained 60 FPS during fast flick on a 3-year-old midrange phone
    B. Sustained 30 FPS, with 60 FPS only required on flagship hardware
    C. No formal budget; reactively fix the worst regressions
Quorum: 6+ votes
Deadline: H84
```

## How to claim and report

1. Claim the aid post.
2. Find a room with 500+ messages. If none of yours qualifies, scroll
   `#welcome:theblackout.app` once the test flight has been running for a
   few hours — it'll be plenty long.
3. Measure. Note the device, OS version, app build, network condition.
4. File a [performance bug](https://github.com/Blackmarket-coa/blackout/issues/new?template=bug-performance.yml)
   with the measurement embedded, OR a [Coliseum finding](https://github.com/Blackmarket-coa/blackout/issues/new?template=coliseum-finding.yml)
   if you'd rather frame it as a challenge result.

## What a high-signal finding looks like

> Pixel 7 Pro, Android 14, Capacitor build 142, Wi-Fi. Scrolled
> #welcome:theblackout.app (~1200 messages) with fast flick. GPU profile
> shows median frame time 14ms (✓ 60fps target) over plain-text section,
> 28ms over a section with inline images (fail), 22ms over a section
> with link previews. Conclusion: image rendering is the dominant cost.

## Why this matters

Mobile users notice scroll jank within seconds. A platform that ships with
unmeasured scroll performance ships with a guaranteed first-impression
problem. The V1.1 performance budget proposal above turns this challenge's
output into an actual commitment.
