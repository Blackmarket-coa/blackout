# The Coliseum

> **Two things share this name.** This document describes the **launch-day
> Coliseum** — a specific *Coalition* seeded for the V1 Test Flight. The
> standalone **discourse feature** (vertical reel, structured debate, public
> dens, live sessions, voting, reputation) is documented separately in
> [`discourse.md`](./discourse.md).

## What it is

The Coliseum is a **Coalition**, not a chat room.

In Blackout, a Coalition is a first-class organizational space defined by
the `co.bmc.coalition` state event
([`packages/core/src/coalition/events.ts:1`](../../packages/core/src/coalition/events.ts)).
A Coalition has:

- An enabled state (on/off)
- A configurable set of tabs — `chat`, `video`, `map`, `shop`, `documents`
  ([`events.ts:11`](../../packages/core/src/coalition/events.ts))
- An optional `canopyId` (parent space)
- A description

What lives inside a Coalition: feed items of five kinds (`video`, `event`,
`aid`, `listing`, `proposal`), a mutual-aid system, governance proposals
and meetings, treasury snapshots, and per-user onboarding Quests. Coalitions
are the unit of structured group activity in Blackout.

The launch-day Coliseum is a **specific Coalition** seeded on
`matrix.theblackout.app` for the 96-hour V1 Test Flight. Its purpose is
single: get the V1 platform stress-tested by the testers who show up.

## Launch-day configuration

The Coliseum Coalition state event content at launch:

```json
{
  "enabled": true,
  "enabledTabs": ["chat", "video", "documents"],
  "description": "V1 Test Flight Coliseum. Eight challenges. File one finding per discovery. See docs/coliseum/ in the repo."
}
```

Tabs chosen:
- **chat** — running conversation, fast questions, "is this me or is the
  build broken?"
- **video** — for screen recordings of findings, plus the host's daily
  walkthrough at H24 / H48 / H72.
- **documents** — pinned references: the 8 challenge briefs (this directory),
  the running known-issues list, the priority-order proposal.

`map` and `shop` are disabled at launch — they're not useful for a
stress-test workflow and would clutter the surface.

The Coalition's room alias is set at the start of B6 (T-4 hours) when the
maintainer creates it on `matrix.theblackout.app`. Once set, it's pinned in
`#welcome:theblackout.app` and listed in [`TESTERS.md`](../../TESTERS.md).

## Challenges: what they are and how they work

Each of the eight launch challenges is a **paired artifact**:

1. **A mutual-aid post** in the Coliseum Coalition. Type `need`, category
   `tech_support`, urgency varies. Its schema lives at
   [`packages/core/src/coalition/mutualAid.ts`](../../packages/core/src/coalition/mutualAid.ts).
   Testers see it in the mutual-aid feed; claiming it is how they declare
   they're attempting the challenge.
2. **A governance proposal stub** for community-voted priority ordering. The
   proposal asks: "Which of the 8 challenges should get focus in the next
   24 hours?" Tally updates feed the daily build report.

Findings flow:

```
Tester attempts a challenge
  ↓
Finds something (bug, papercut, surprise, confirmation)
  ↓
Files a Coliseum-finding GitHub issue
  https://github.com/Blackmarket-coa/blackout/issues/new?template=coliseum-finding.yml
  - Selects the challenge from the dropdown
  - Pastes the aid-post link if they claimed one in-app
  ↓
Maintainer triages
  - Labels with severity:* and challenge:<slug>
  - Updates the in-app aid post status (open → fulfilled if the finding closes the question)
  - Links the issue ID into the aid post's metadata field
```

One finding per issue. If you broke three things, file three issues — the
daily build report counts findings, not bug-roll-ups.

## The eight challenges

| ID | Slug | Brief | GitHub label | In-Coalition urgency |
|---:|---|---|---|---|
| 01 | onboarding | [Sign up to first message in <10 min on mobile](challenges/01-onboarding.md) | `challenge:onboarding` | high |
| 02 | voice | [1:1 voice across two networks for 5+ min](challenges/02-voice.md) | `challenge:voice` | high |
| 03 | mobile | [Photo + voice note iOS ↔ Android, verify on web](challenges/03-mobile.md) | `challenge:mobile` | medium |
| 04 | federation | [Join the Coliseum from a non-Blackout homeserver](challenges/04-federation.md) | `challenge:federation` | high |
| 05 | stego | [Encode and decode a hidden message; report carrier failures](challenges/05-stego.md) | `challenge:stego` | medium |
| 06 | governance | [Vote on the seeded priority proposal; verify tally](challenges/06-governance.md) | `challenge:governance` | medium |
| 07 | performance | [Scroll 500+ message backlog on mobile; report FPS](challenges/07-performance.md) | `challenge:performance` | medium |
| 08 | deaddrop | [Send and retrieve a deaddrop; verify PQ-hybrid envelope](challenges/08-deaddrop.md) | `challenge:deaddrop` | low |

## How to attempt one

1. Open the Coliseum Coalition (link pinned in `#welcome:theblackout.app`).
2. Browse the mutual-aid feed; pick a challenge that calls to you.
3. Tap **Claim** on the aid post (this marks it `in_progress` and tells
   other testers you're on it — duplicate effort is fine for stress
   testing, but visibility is better).
4. Read the brief at `docs/coliseum/challenges/<NN>-<slug>.md` (linked from
   the aid post).
5. Try the thing. Hard.
6. File a [Coliseum finding](https://github.com/Blackmarket-coa/blackout/issues/new?template=coliseum-finding.yml)
   for anything noteworthy — including "I tried and it worked perfectly,"
   which is a valid finding and gives us confidence signal.

## After H96

The Coliseum Coalition stays online after the test flight. Its role shifts
from "stress testing" to "ongoing tester home base." The launch challenges
freeze in place as a record; new challenges (if any) get a new generation
(`challenge:gen2-<slug>`). Findings filed post-launch get the `post-launch`
label rather than a cohort label.

The V1.1 roadmap ([`docs/launch/V1.1_ROADMAP.md`](../launch/V1.1_ROADMAP.md))
draws heavily from Coliseum findings — the issues labeled
`T-Coliseum-Finding` with `severity:high` or `severity:critical` form the
first cut of the V1.1 list.

## Why a Coalition and not a room

A Matrix room is fine for chat, but a chat-only surface doesn't capture
attempts, claims, or status. The Coalition primitive gives us:

- A **structured feed** (the 8 challenges as aid posts, not 8 pinned messages)
- **Status transitions** (`open → in_progress → fulfilled`) that match the
  testing workflow naturally
- **Governance** (the priority-order proposal lives in-Coalition, not
  off-platform)
- **Discoverability** — testers see the Coliseum next to their other
  Coalitions in the room list, not buried in `#coliseum`

In other words: the Coliseum is a dog-fooding exercise. We're using the
platform's own organizational primitive to coordinate the testing of the
platform.
