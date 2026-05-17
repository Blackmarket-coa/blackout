# Contributor Roles — V1 Test Flight

During the 96-hour test flight, contributions cluster naturally into five
roles. **You self-claim a role; nobody assigns you one.** Recognition is
repo-side (Contributor Spotlights in the daily build reports) for the test-
flight window — in-app badges are explicitly V1.2.

If your contribution doesn't fit any of these, fit a square peg in any role
you like and tell us; we'll refine the taxonomy in V1.1.

All participation is governed by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

---

## Scout

**What they do**

Exploratory testing. Sign up, click everything, try the weird path, find the
papercuts. File the things that confused you, the surprising states, the
edges that don't match the docs. Two specific channels:

- [Onboarding confusion](https://github.com/Blackmarket-coa/blackout/issues/new?template=onboarding-confusion.yml)
  — lower bar than a bug. "I got stuck here" is the report.
- [Coliseum finding](https://github.com/Blackmarket-coa/blackout/issues/new?template=coliseum-finding.yml)
  — one issue per challenge finding.

**How to claim**

Comment "claiming scout" on the launch announcement Discussion. No DM, no
permission needed. Add the `role:scout` label to your filed issues so the
daily build report can find them.

**How to be recognized**

3+ accepted Scout findings within a 24-hour cohort → spotlight in that
cohort's daily build report. Top-scouted papercut at H96 → named in the V1.1
launch post.

**Exit criteria**

You stop being a Scout when you stop wanting to be. There's no checkout
process. If you migrate to Builder (PRs) or Operator (triage), great — many
people do both.

**Cross-links**

[`TESTERS.md`](TESTERS.md) — orientation. [`docs/coliseum/`](docs/coliseum/) —
the 8 launch challenges.

---

## Operator

**What they do**

Run the matrix.theblackout.app rooms and triage the issue tracker.
Specifically:

- Monitor `#welcome:theblackout.app` and answer tester questions.
- Watch `#bug-reports:theblackout.app` (the hosted-instance funnel) and
  route reports to the right GitHub issue template.
- Triage new issues: add `severity:*`, `surface:*`, and `area:*` labels;
  flip `needs-triage` to `confirmed` or `awaiting-author`.
- Help compile the daily build report from the issue queue.

**How to claim**

Pair with an existing maintainer for one hour. After the pairing, the
maintainer adds you to the `Blackmarket-coa/operator` team and grants
`triage` permission on the repo. This isn't gatekeeping — it's so the
maintainer can give you the unwritten judgement calls before you make them
in public.

**How to be recognized**

Operators are named in every daily build report they help compile. At H96,
named operators are listed in the V1.1 launch post and offered the
[`CO_MAINTAINER_ONBOARDING.md`](docs/operations/CO_MAINTAINER_ONBOARDING.md)
ladder (this role is rung 0 of that ladder).

**Exit criteria**

Step back any time. The expectation during the 96h window is a few hours per
day, not 24/7 cover.

**Cross-links**

[`docs/operations/operator_onboarding_pack.md`](docs/operations/operator_onboarding_pack.md) —
operational playbook.
[`docs/operations/CO_MAINTAINER_ONBOARDING.md`](docs/operations/CO_MAINTAINER_ONBOARDING.md) —
where this role can lead.
[`docs/launch/MODERATOR_BRIEFING.md`](docs/launch/MODERATOR_BRIEFING.md) —
launch-week-specific tone and escalation paths.

---

## Builder

**What they do**

Ship PRs. The
[`good first issue`](https://github.com/Blackmarket-coa/blackout/labels/good%20first%20issue)
queue is seeded with 8-12 starter tasks at launch — pull one, work on it,
open a PR.

**How to claim**

Comment on a `good first issue` saying you're working on it. That's the
claim. Maintainers won't double-assign while a claim is fresh (~48 hours
before re-opening).

**How to be recognized**

First merged PR → spotlight in the next daily build report. Subsequent PRs
land in the merged-PR section of each daily report.

**Exit criteria**

You haven't agreed to keep contributing; that's V1.1's conversation. The PRs
you land are the deliverable.

**Cross-links**

[`CONTRIBUTING.md`](CONTRIBUTING.md) — full PR process.
[`docs/launch/SEEDED_ISSUES.md`](docs/launch/SEEDED_ISSUES.md) — the 12
starter tasks and what each one needs.

---

## Signal

**What they do**

Tell people about Blackout in public — long-form writing, video, social
posts, talks. The role exists because nobody else can speak from your
position with your audience.

**How to claim**

Open a [Discussion](https://github.com/Blackmarket-coa/blackout/discussions)
in the **UX Feedback** or **Roadmap** category summarizing what you observed,
linked to your public write-up if you have one. That post is your claim and
your contribution — you've moved learning back into the repo.

**How to be recognized**

Your Discussion is linked from the daily build report. If your write-up
shapes a roadmap decision, you're cited by name in the V1.1 launch post.

**Exit criteria**

None. Keep going as long as you have something to say.

**Cross-links**

[`docs/launch/V1.1_ROADMAP.md`](docs/launch/V1.1_ROADMAP.md) — how Signal
Discussions feed the roadmap.

---

## Federation Team

**What they do**

Operate a peer homeserver during the 96-hour window. Validate cross-server
messaging, file
[Federation bugs](https://github.com/Blackmarket-coa/blackout/issues/new?template=bug-federation.yml),
and demonstrate that Blackout works as a federated platform, not just a
hosted-instance app.

**How to claim**

Two steps:

1. Stand up your peer homeserver per
   [`docs/operations/runbooks/independent-org-to-coalition-onboarding.md`](docs/operations/runbooks/independent-org-to-coalition-onboarding.md).
2. Post your homeserver domain in the
   [Federation Policy Discussion](https://github.com/Blackmarket-coa/blackout/discussions/new?category=federation)
   category so we can join you to the test-flight Coliseum.

**How to be recognized**

Peer homeservers federating cleanly for 48+ hours are listed in the V1.1
roadmap as **federation partners** — both as recognition and to give other
testers a real list of peer homeservers they can sign up on.

**Exit criteria**

Tear down your peer whenever you want. If you keep it running past H96, you
become a permanent federation partner; reach out and we'll work out a stable
listing.

**Cross-links**

[`docs/coliseum/challenges/04-federation.md`](docs/coliseum/challenges/04-federation.md) —
the federation challenge brief; doubles as a starter sequence for this role.

---

## What "recognition" looks like in practice

Each daily build report (`docs/launch/builds/H{N}.md`, starting at H48)
contains a **Spotlights** section with 3-5 names per cohort. The structure:

```
- @handle (role:scout) — Found the auth flow papercut documented in #142.
- @handle (role:builder) — Merged #156, the Playbook Q1 SVG drop-in.
- @handle (role:federation-team) — Brought my-peer.example online and held
  it for the federation challenge.
```

The spotlight is a one-line citation. The deliverable is the link.

At **H96**, the V1.1 launch post collects:

- Total tester count, by claimed role.
- Top 5 most-impactful contributions across all roles.
- Federation partners (peer homeservers that held 48+ hours).
- A thank-you list with no ranking — anyone who claimed a role and showed up.

If you put real time in and we miss you, ping a maintainer in
`#blackout-dev:theblackout.app`. We'd rather over-credit than under-credit.

---

## What we explicitly do **not** do

- Assign roles. Self-claim, always.
- Track hours, rank contributors, or hold a competition.
- Use in-app gamification. (V1.2 will introduce a recognition surface; see
  [`docs/launch/V1.1_ROADMAP.md`](docs/launch/V1.1_ROADMAP.md) for context
  on why it's deferred.)
- Punish people for stepping back. The 96h test flight is a sprint, not a
  job.
