# Moderator Briefing — V1 Test Flight

For the 3–6 named operators handling `matrix.theblackout.app` rooms during
the 96-hour V1 Test Flight window. Read this before your first shift.

This briefing is the **operational** layer that sits on top of two
authoritative documents:

- [`CODE_OF_CONDUCT.md`](../../CODE_OF_CONDUCT.md) — what conduct is governed and the enforcement ladder
- [`docs/operations/operator_onboarding_pack.md`](../operations/operator_onboarding_pack.md) — the general operator playbook

If anything in this briefing conflicts with either of those, the
authoritative documents win and you should flag the conflict to a
maintainer.

---

## Tone register

> We're throwing a test, not a launch party.

Curious about bugs, blameless when the platform misbehaves, firm on
conduct. The tester audience during this window is doing us a favor by
showing up — most of what hits you will be confused users, not bad actors.
Default to **assume good faith and route to the right help** before
escalating.

Three phrases that work well in `#welcome`:

- "Good catch — would you mind filing that as `<template>`? It's the fastest path to a fix."
- "I haven't seen that before. Can you share a screenshot in this thread?"
- "That's a [Coliseum challenge](../coliseum/README.md) finding — claim the aid post and file it as a Coliseum finding."

---

## Your shift, in one paragraph

You watch `#welcome:theblackout.app` and the issue tracker. You route
incoming reports to the right template, apply `needs-triage` →
`confirmed` / `awaiting-author` / `severity:*` labels, and answer
orientation questions. You escalate the small set of situations described
below. You hand off cleanly to the next operator at the end of your
shift using the handoff template at the bottom of this document.

---

## What to escalate (and to whom)

### Tier A — Immediate maintainer attention

Three situations require you to ping a named maintainer in the private
`#mod-internal` channel immediately, even at unsocial hours:

1. **A working exploit was posted publicly** (in a room, an issue, a PR
   description, or a Discussion). Action: remove the message; DM the
   author pointing them at [`SECURITY.md`](../../SECURITY.md); log the
   incident in `#mod-internal` with the original message redacted to a
   short description. Reasoning is in `SECURITY.md` — public-exploit
   posts are themselves a Code of Conduct violation in addition to the
   security response.
2. **Content prohibited by the project's hosting jurisdiction** (anything
   illegal under applicable law). Remove from the room; preserve evidence
   in `#mod-internal` with the timestamp and account handle; escalate to
   a maintainer for the legal-response decision tree.
3. **Credible threat against an identified person.** Apply the
   Contributor Covenant enforcement ladder's highest rung (permanent
   ban from project spaces); preserve evidence; escalate.

Do not try to handle any of the above unilaterally. The maintainer team
exists so individual operators don't carry the load alone.

### Tier B — Two-operator consensus before action

Use this tier for ambiguous Code of Conduct cases — borderline behavior,
suspected sockpuppets, repeated friction that doesn't cleanly trip a
Covenant rung. Action requires explicit agreement between you and one
other operator (visible in `#mod-internal`). If you can't reach a second
operator within 60 minutes, escalate to Tier A rather than acting alone.

### Tier C — Operator judgement (you handle it)

Everything else. Off-topic threads, low-stakes papercuts, "I'm confused"
spirals, gentle nudges toward the right template. Use your judgement.
If a situation feels heavier than your judgement can carry, move it to
Tier B or A; there is no shame in escalating.

---

## Operational escalation paths (non-conduct)

These are NOT conduct issues — they're operational. Different on-call
ladder.

| Situation | Where to go |
|---|---|
| Federation incident (peer homeserver issue, propagation failures) | [`docs/operations/oncall_escalation_tree.md`](../operations/oncall_escalation_tree.md) |
| Bot / spam spike | [`docs/runbooks/bot_abuse_spike_playbook.md`](../runbooks/bot_abuse_spike_playbook.md) |
| Homeserver health (sync failures, sign-up broken, hosted instance unreachable) | The current on-call rotation; the channel is in `oncall_escalation_tree.md` |
| Issue tracker abuse (mass spam issues, scripted PR floods) | Maintainer in `#mod-internal`; reference label `spam`, apply, then close |

---

## What operators should NOT do

Some lines that exist to keep operator energy bounded and decisions
reversible.

- **Do not make architectural promises.** "V1.1 will definitely include X"
  is a maintainer commitment, not an operator one. Phrase suggestions as
  "I'd love to see X in V1.1; please add it to the Roadmap Discussion."
- **Do not edit governance proposals mid-flight.** If a proposal needs to
  change, open a new one and reference the old.
- **Do not act unilaterally on Tier B situations.** Two-operator
  consensus, always.
- **Do not edit tester issues to "fix" them.** Comment instead. Edits to
  others' issues read as condescension and undermine the contribution.
- **Do not match heat with heat.** If a tester is frustrated, mirror calm.
  If a thread is escalating, slow it down or step away and ask another
  operator to take it.
- **Do not commit to round-the-clock coverage.** The 96-hour window has
  three shifts of 8 hours each, with operators rotating. Push back on
  schedules that have you on for more than 8 consecutive hours.

---

## End-of-shift handoff template

When your shift ends, post this in `#mod-internal` (private operators-only
channel). The next operator reads it before opening `#welcome`.

```
Shift handoff — H{N} to H{N+8} — @your-handle → @next-handle

1. Incidents this shift: [count] — [one-line each, link if filed]
2. Top concern right now: [single most important thing for the next shift]
3. Pending tester support: [open threads in #welcome that need follow-up]
4. Pending PR review asks: [issues/PRs where contributors are waiting on review]
5. Fatigue / availability: [your honest signal — am I OK, do I need to step out for the next 24h, etc.]
```

Five bullets. No more. The handoff is not a status report — it's a
context dump for one person.

---

## Recognition for operators

You are named in:

- Every daily build report (`docs/launch/builds/H{N}.md`) you help compile.
- The H48 and H96 spotlight sections.
- The V1.1 launch post, by name, with role:operator attribution.

Operators are offered the [`CO_MAINTAINER_ONBOARDING.md`](../operations/CO_MAINTAINER_ONBOARDING.md)
ladder at H96 — this role is rung 0 of that ladder.

We do **not** publish operator names in the public repo without your
explicit consent. The launch post will ask each operator individually
before listing.

---

## If you need to step back

The test flight is 96 hours. We do not expect any single operator to be
present for all of them. If you need to drop your remaining shifts:

1. Post in `#mod-internal` that you're stepping back. No reason required.
2. Hand off (template above) if your shift is mid-flight.
3. Ping a maintainer so they can pull a backup operator.

We will not list you as "absent" or hold this against you in any way. The
job is voluntary, the hours are intense, and burnout in the first 24
hours is a known failure mode. Stepping back is the responsible move.

---

## Cross-references

- [`CODE_OF_CONDUCT.md`](../../CODE_OF_CONDUCT.md) — what is governed; the enforcement ladder
- [`CONTRIBUTOR_ROLES.md`](../../CONTRIBUTOR_ROLES.md) — the operator role definition for testers reading from outside
- [`docs/operations/operator_onboarding_pack.md`](../operations/operator_onboarding_pack.md) — full operator playbook
- [`docs/operations/oncall_escalation_tree.md`](../operations/oncall_escalation_tree.md) — operational escalation
- [`docs/runbooks/bot_abuse_spike_playbook.md`](../runbooks/bot_abuse_spike_playbook.md) — bot/spam path
- [`SECURITY.md`](../../SECURITY.md) — vulnerability disclosure process
