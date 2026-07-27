# Daily build reports

This directory is the home of the **daily build reports** referenced by the
defect-intake loop (audit finding M20). Each report is a point-in-time snapshot
of the test-flight → GA window: top-line metrics, new findings, and the curation
step that promotes triaged issues onto the top-5 in [`../../../KNOWN_ISSUES.md`](../../../KNOWN_ISSUES.md).

## Cadence

Instantiate [`../DAILY_BUILD_REPORT.template.md`](../DAILY_BUILD_REPORT.template.md)
as `H{N}.md` here, where `{N}` is the cohort hour since launch:

-   **H0** — launch baseline (this state; see [`H0.md`](H0.md)).
-   **H48, H72, H96** — required.
-   **H6, H12, H24** — optional, if the cadence helps.

```bash
cp docs/launch/DAILY_BUILD_REPORT.template.md docs/launch/builds/H48.md
# then replace {N} in the filename/title and fill in the metrics block
```

## How it feeds KNOWN_ISSUES.md

Each report runs the curation step: issues labelled `needs-curate-known-issue`
are pulled, added to the `KNOWN_ISSUES.md` table, and the label removed. That is
what keeps the top-5 list live instead of stale. See the "How this list is
maintained" section of `KNOWN_ISSUES.md`.

## Relationship to the pre-launch audit

Open items carried into launch from the pre-launch readiness audit are tracked
in that report's **Appendix B**
([`../../audits/pre-launch-readiness-audit-2026-07.md`](../../audits/pre-launch-readiness-audit-2026-07.md))
and in [`../../../KNOWN_LIMITATIONS.md`](../../../KNOWN_LIMITATIONS.md). The daily
reports here track _newly discovered_ defects during the flight, not those
planned deferrals.
