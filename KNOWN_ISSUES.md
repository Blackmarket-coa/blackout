# Known Issues — V1 Test Flight

This is the running list of **defects discovered during the 96-hour V1
test flight**. It is distinct from [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md):

| File                                           | Contents                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) | Planned deferrals — features intentionally incomplete for V1. Pre-existing before launch. |
| **`KNOWN_ISSUES.md` (this file)**              | Defects discovered during the test flight. Updated in each daily build report.            |

If you found something and don't see it here yet, file an issue — don't
assume someone else already did. Duplicates are easy to mark; missed reports
are not. Use the right template:
[Issues → choose template](https://github.com/Blackmarket-coa/blackout/issues/new/choose).

## Top 5 right now

Updated daily from H48 onward, in the daily build report at
`docs/launch/builds/H{N}.md`. The defect-intake loop is wired: the
`docs/launch/builds/` directory exists with a baseline `H0.md` and a
[`README.md`](docs/launch/builds/README.md) describing the cadence and the
curation step. This list is empty because no test-flight **defects** have been
curated yet — not because the loop isn't running.

Open items carried in from the pre-launch readiness audit (the deferred React
18→19 / react-router 8 migration, counsel review of the drafted Privacy Policy /
ToS, the production-like E2E + load run) are tracked in that report's Appendix B
(`docs/audits/pre-launch-readiness-audit-2026-07.md`) and in
[`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md), since they are planned deferrals
rather than newly discovered defects.

1. _(none curated yet — see the audit Appendix B for pre-launch open items)_
2.
3.
4.
5.

## Full list

|         ID | First seen | Surface | Severity | Status | Workaround | ETA |
| ---------: | ---------- | ------- | -------- | ------ | ---------- | --- |
| _none yet_ |            |         |          |        |            |     |

## How this list is maintained

When a maintainer triages an incoming issue and decides it belongs on this
list, they add the **`needs-curate-known-issue`** label. The next daily
build report includes the curation step:

```bash
# Pull all issues tagged for curation
gh issue list --label "needs-curate-known-issue" --json number,title,labels,createdAt --limit 100 \
  > /tmp/curate.json

# After updating the table above, remove the label so the issue doesn't
# get pulled again next time
gh issue list --label "needs-curate-known-issue" --json number --jq '.[].number' | \
  xargs -I {} gh issue edit {} --remove-label "needs-curate-known-issue"
```

Severity assignments follow `.github/labels.yml`:

-   `severity:critical` — data risk, sign-in broken, hosted instance down.
-   `severity:high` — major feature unusable for many users.
-   `severity:medium` — feature degraded; workaround exists.
-   `severity:low` — minor; cosmetic or rare path.
-   `severity:papercut` — visible, impactful, easy to action.

## Relationship to V1.1

At H84+ the V1.1 roadmap planning starts. Issues on this list with
`severity:critical` or `severity:high` are the first cut of V1.1 scope. See
[`docs/launch/V1.1_ROADMAP.md`](docs/launch/V1.1_ROADMAP.md).
