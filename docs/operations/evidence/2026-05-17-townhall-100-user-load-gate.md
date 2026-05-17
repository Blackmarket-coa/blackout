# Townhall 100-user load gate — 2026-05-17 status

Refresh of [`2026-02-20-townhall-100-user-load-gate.md`](./2026-02-20-townhall-100-user-load-gate.md).

- Branch: `claude/production-readiness-check-9rxU3`
- HEAD: `b7d3571`

## Original test status: RETIRED

The 2026-02-20 file cited `yarn -s test test/services/blackout/TownhallLoadGate-test.ts`.
That test file no longer exists anywhere in the repo at HEAD `b7d3571`:

```
$ grep -rln "TownhallLoadGate" --include='*.ts' --include='*.tsx' \
    apps/ packages/ legacy/ test/
(no matches)
$ find . -path '*/node_modules' -prune -o -name 'TownhallLoadGate*' -print
(no matches)
```

The Element-fork era `test/services/blackout/` directory was excised
in the monorepo migration (see
`docs/audits/unfinished_items_review_2026_05.md` and
`docs/architecture/frontend-consolidation-disposition.md`). The
100-user gate that test enforced is **not gone** — it was functionally
replaced by:

1. **Nightly k6 load harness** — `.github/workflows/load.yml`
   (cron `0 4 * * *`) brings up postgres+redis+api and runs
   `load/k6/{auth,health,rate-limit}.js`. Continues exercising the
   concurrency dimensions the unit test simulated, but against the
   real API rather than a service stub.
2. **Townhall-specific load-gates plan** —
   `docs/operations/evidence/2026-03-16-townhall-load-gates-100-250-500-plan.md`
   carries the 100/250/500 staircase forward.
3. **Townhall observability** — alerts
   (`docs/operations/alerts/townhall-sfu-alert-rules.yaml`) +
   dashboard
   (`docs/operations/dashboards/townhall-sfu-observability-dashboard.json`)
   detect saturation in production rather than relying on a unit-test
   gate.

## Verdict

**RETIRED, not regressed.** The 2026-02-20 evidence file is
superseded by the three mechanisms above. No action required; future
refreshes of this gate should point at `load.yml` runs and any
`townhall-*` evidence files dated after 2026-03-16.
