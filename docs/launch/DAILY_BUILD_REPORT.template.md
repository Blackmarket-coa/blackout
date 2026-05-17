# Daily Build Report — H{N}

> Instantiate this template at H0 (`docs/launch/builds/H0.md`) with
> placeholder content ("test flight just started; first metrics at H06"),
> then again at H48, H72, and H96. Optional but recommended additionally at
> H6, H12, H24 if the cadence helps.
>
> Replace `{N}` in the filename and the title with the cohort hour.

| | |
|---|---|
| **Date (UTC)** | YYYY-MM-DD HH:MM |
| **Hours elapsed since launch** | {N} |
| **Cohort label** | `H{N-prev}-{N}` (e.g. `H48-60`) |
| **Author** | @maintainer-handle |

---

## Top-line metrics

Pre-fill the table below with this one-liner (adjust labels for your cohort):

```bash
COHORT="H48-60"
SINCE="2026-05-19T00:00:00Z"  # 24h before now
echo "Signups: $(curl -s https://matrix.theblackout.app/_synapse/admin/v1/statistics/users/media | jq -r .total_users 2>/dev/null || echo MANUAL)"
echo "Issues opened (24h):  $(gh issue list --search "created:>=$SINCE" --state all --json number | jq length)"
echo "Issues closed (24h):  $(gh issue list --search "closed:>=$SINCE" --state closed --json number | jq length)"
echo "PRs merged (24h):     $(gh pr list --search "merged:>=$SINCE" --state merged --json number | jq length)"
echo "Cohort findings:      $(gh issue list --label "$COHORT" --json number | jq length)"
```

| Metric | Today | Δ since last report |
|---|---:|---:|
| Signups (cumulative) |  |  |
| DAU (rough) |  |  |
| Issues opened (last 24h) |  |  |
| Issues closed (last 24h) |  |  |
| PRs merged (last 24h) |  |  |
| Federation peers active |  |  |

---

## What shipped (merged PRs, last 24h)

- #NNN — _one-line summary_ — @author
- #NNN — _one-line summary_ — @author

(If none, write "no merges this cohort — focus was on triage and recognition.")

---

## What broke (open `severity:critical` and `severity:high`)

```bash
gh issue list --label "severity:critical" --state open --json number,title --limit 50
gh issue list --label "severity:high"     --state open --json number,title --limit 50
```

- #NNN — _title_ — status: _triaged / in-progress / awaiting-author_

---

## Coliseum scoreboard

Findings per challenge in the last 24h:

| Challenge | Filed (24h) | Total | Notable |
|---|---:|---:|---|
| 01 onboarding |  |  |  |
| 02 voice |  |  |  |
| 03 mobile |  |  |  |
| 04 federation |  |  |  |
| 05 stego |  |  |  |
| 06 governance |  |  |  |
| 07 performance |  |  |  |
| 08 deaddrop |  |  |  |

**Most-tested challenge:** _slug_.
**Least-tested challenge (recruit testers in next cohort):** _slug_.

Aid posts fulfilled this cohort: _N_. Aid posts opened this cohort: _N_.

---

## Contributor spotlights (3–5 per cohort)

- @handle (`role:scout`) — _what they did_, link to artifact (issue/PR/discussion).
- @handle (`role:builder`) — _merged PR or doc_, link.
- @handle (`role:federation-team`) — _federation milestone_, link.

Aim for diversity across roles. If one role is over-represented, ask the
under-represented role to surface itself in tomorrow's report.

---

## Known issues snapshot

Top 5 by impact, per [`KNOWN_ISSUES.md`](../../KNOWN_ISSUES.md):

1. #NNN — _title_ — workaround: _none / X_.
2. _..._

Full list: [`KNOWN_ISSUES.md`](../../KNOWN_ISSUES.md).

---

## Tomorrow's focus

In one sentence: what should testers prioritize in the next 24 hours?

> e.g. "Federation peers, please stay online for another 24 hours so we
> reach the 48-hour partner threshold. Onboarding scouts: try the **mobile**
> path now that web is well-covered."

---

## Footnotes (use sparingly)

- _Notable Discussion threads from this cohort that didn't make spotlights._
- _Process notes from operators that other operators should see._
- _Anything you want the H{N+12} reporter to remember._
