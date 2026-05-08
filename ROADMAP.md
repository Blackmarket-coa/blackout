# Blackout Roadmap

The canonical milestone tracker for the Black Market Coalition lives in
[`docs/AGGRESSIVE_OPERATIONS_GUIDE.md`](docs/AGGRESSIVE_OPERATIONS_GUIDE.md).
That document defines the four milestone tiers (Foundation, Differentiation,
Density, Infrastructure), their entry conditions and exit criteria, and the
master progress trackers for FBM, Blackout, and cross-cutting workstreams.

This file exists as a stable companion-doc target. It does not duplicate the
operations guide; it points at it.

## What lives where

| Surface                                                | Path                                                                                              |
|--------------------------------------------------------|---------------------------------------------------------------------------------------------------|
| Milestone tiers, exit criteria, master progress tracker | [`docs/AGGRESSIVE_OPERATIONS_GUIDE.md`](docs/AGGRESSIVE_OPERATIONS_GUIDE.md)                       |
| Single-server production runbook                        | [`infra/single-server-baseline/RUNBOOK.md`](infra/single-server-baseline/RUNBOOK.md)               |
| SLO dashboards, on-call escalation, secrets break-glass | [`docs/operations/`](docs/operations/)                                                            |
| Incident playbooks                                      | [`docs/runbooks/`](docs/runbooks/)                                                                |

## FBM-side companions

The cooperative-economic substrate lives in the FBM repository at
`Blackmarket-coa/free-black-market`. Authoritative FBM-side prioritization is
tracked in `FEATURE_BUILD_PLAN.md` and `docs/VENDOR_PORTAL_PROJECT_TRACKER.md`
in that repository. The unified operations guide above sequences and frames
those tracker artifacts; it does not replace them.
