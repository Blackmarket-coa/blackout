# Testers — start here

Welcome to the **Blackout V1 Test Flight** — a 96-hour public test of a
federated, end-to-end-encrypted communication platform. Your reports during
this window become the V1.1 roadmap. No installation required to take part.

> **This is a test, not a daily-driver app.** Treat your account here as
> experimental. Don't move sensitive conversations onto Blackout yet. We
> reserve the right to reset state, change defaults, or take rooms down
> during the window.

---

## Sign up (4 steps, ~5 minutes)

The V1 Test Flight is **invite-only**: signup needs a one-time
registration token from a maintainer. Tokens are cheap to issue, so
don't be shy about asking.

1. **Request an invite token** by opening an
   [Invite request issue](https://github.com/Blackmarket-coa/blackout/issues/new?template=invite-request.yml)
   (or DM a maintainer listed in [`.github/CODEOWNERS`](.github/CODEOWNERS)).
   The form asks for a Matrix handle to DM the token to — the token
   itself is never posted in the issue thread.
2. Open **[`https://matrix.theblackout.app`](https://matrix.theblackout.app)**
   in any modern browser (Firefox, Chrome, Edge, Safari).
3. Click **Create account** and paste the token when the signup form
   asks for one.
4. Once you're in, join **[`#welcome:theblackout.app`](https://matrix.to/#/#welcome:theblackout.app)**.

That's it. You're on. The rest of this document is what to do next.

If you'd rather use the desktop or mobile build, the latest releases live on
[GitHub Releases](https://github.com/Blackmarket-coa/blackout/releases). The
web client is the recommended path during the test flight.

---

## 5-minute orientation

Try these six things in order — it's the fastest way to see what Blackout
does differently from a generic chat app.

1. **Say hello** in `#welcome:theblackout.app`.
2. **Start a 1:1 voice call** with another tester in the room.
3. **Upload an image** (photo, screenshot, drawing — anything).
4. **Open the Coliseum Coalition.** It's a special Coalition (not just a
   chat room) seeded for the test flight. See
   [`docs/coliseum/README.md`](docs/coliseum/README.md) for the full
   description.
5. **Browse the mutual-aid feed** in the Coliseum. Each "challenge" we want
   tested is posted as a mutual-aid `need`. Pick one that looks interesting.
6. **Vote on the priority-order proposal** posted in the Coliseum's
   governance tab. Your vote shapes which test areas get focus in the next
   24 hours.

If something in those six steps confused you — write it down. We want to
know. Open an
[Onboarding confusion issue](https://github.com/Blackmarket-coa/blackout/issues/new?template=onboarding-confusion.yml)
and tell us where you got stuck.

---

## What to do for the rest of the 96 hours

### Take on a Coliseum challenge

There are 8 challenges. Each is a real area we need stress-tested:

1. **Onboarding** — sign up to first message in under 10 minutes on mobile
2. **Voice** — 1:1 voice across two different networks for 5+ minutes
3. **Mobile** — send a photo + voice note iOS↔Android, verify on web
4. **Federation** — join the Coliseum from a non-Blackout homeserver
5. **Steganography** — encode and decode a hidden message
6. **Governance** — vote on the seeded priority proposal and verify the tally
7. **Performance** — scroll a 500+ message backlog on mobile and report FPS
8. **Deaddrop** — send and retrieve a deaddrop message

Full briefs (and the in-Coalition aid-post for each) are in
[`docs/coliseum/`](docs/coliseum/). When you find something interesting,
file a [Coliseum finding](https://github.com/Blackmarket-coa/blackout/issues/new?template=coliseum-finding.yml).

### Pick a role

If you find yourself drawn to a particular kind of contribution, you can
self-claim one of five roles for the test-flight window. See
[`CONTRIBUTOR_ROLES.md`](CONTRIBUTOR_ROLES.md):

- **Scout** — exploratory testing, papercut filing
- **Operator** — moderation, triage, support in `#welcome`
- **Builder** — PRs against [`good first issue`](https://github.com/Blackmarket-coa/blackout/labels/good%20first%20issue)
- **Signal** — public testimony (long-form, video, social)
- **Federation Team** — operate a peer homeserver for 96 hours

---

## How to report things

| What you found | Where to put it |
|---|---|
| A bug on web | [Bug report (web)](https://github.com/Blackmarket-coa/blackout/issues/new?template=bug-web.yml) |
| A bug on desktop | [Bug report (desktop)](https://github.com/Blackmarket-coa/blackout/issues/new?template=bug-desktop.yml) |
| A bug on mobile | [Bug report (mobile)](https://github.com/Blackmarket-coa/blackout/issues/new?template=bug-mobile.yml) |
| Calls / voice / video broke | [Voice/video bug](https://github.com/Blackmarket-coa/blackout/issues/new?template=bug-voice-video.yml) |
| Something across homeservers | [Federation bug](https://github.com/Blackmarket-coa/blackout/issues/new?template=bug-federation.yml) |
| Slow / janky / battery-hungry | [Performance bug](https://github.com/Blackmarket-coa/blackout/issues/new?template=bug-performance.yml) |
| You gave up / got confused / had to guess | [Onboarding confusion](https://github.com/Blackmarket-coa/blackout/issues/new?template=onboarding-confusion.yml) |
| Coliseum challenge finding | [Coliseum finding](https://github.com/Blackmarket-coa/blackout/issues/new?template=coliseum-finding.yml) |
| Idea or feature request | [Enhancement](https://github.com/Blackmarket-coa/blackout/issues/new?template=enhancement.yml) or [Discussion](https://github.com/Blackmarket-coa/blackout/discussions) |
| Non-exploitable security concern | [Security concern](https://github.com/Blackmarket-coa/blackout/issues/new?template=security-concern.yml) |
| **An actual vulnerability you can exploit** | **[Security Advisory](https://github.com/Blackmarket-coa/blackout/security/advisories/new) — NOT a public issue.** See [`SECURITY.md`](SECURITY.md). |
| Someone is being awful | DM a maintainer (see [`.github/CODEOWNERS`](.github/CODEOWNERS)) — see [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) |

---

## Known limitations

Some things are intentionally incomplete during the test flight. Before you
file something, skim [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) — it lists
the gaps we already know about, so you don't have to write a report for
something already on the roadmap.

For defects discovered **during** the 96 hours, we publish a running list at
[`KNOWN_ISSUES.md`](KNOWN_ISSUES.md), updated daily from H48 onward.

---

## How recognition works

We name testers in the **daily build reports** (`docs/launch/builds/H{N}.md`)
and the final V1.1 launch post. There are no in-app badges yet — that's V1.2.
But the daily reports are public, indexed by GitHub, and pinned in
`#welcome:theblackout.app`. If you put in real time and we miss you, ping a
maintainer; we'd rather over-credit than under-credit.

Specific recognition triggers (per [`CONTRIBUTOR_ROLES.md`](CONTRIBUTOR_ROLES.md)):

- 3+ accepted Scout findings → spotlight
- First merged PR as Builder → spotlight
- Peer homeserver federating cleanly for 48h → listed in V1.1 roadmap as a federation partner
- Long-form public write-up as Signal → linked from the daily report

---

## What this is **not**

- **Not a daily driver.** Don't migrate your daily comms here yet.
- **Not stable across the 96-hour window.** We may reset state, take rooms
  down, or change defaults. We'll announce major changes in
  `#welcome:theblackout.app` and the daily build reports.
- **Not a secure messenger for high-risk threat models yet.** See
  [`THREAT_MODEL.md`](THREAT_MODEL.md) for what we model and what we don't.
- **Not anonymous.** Pseudonymous, yes; anonymous, no.

---

## Questions

- Orientation, "where do I…?": [`#welcome:theblackout.app`](https://matrix.to/#/#welcome:theblackout.app)
- Code, contributing, architecture: [`#blackout-dev:theblackout.app`](https://matrix.to/#/#blackout-dev:theblackout.app)
- Open-ended discussion: [GitHub Discussions](https://github.com/Blackmarket-coa/blackout/discussions)

Thanks for flying.
