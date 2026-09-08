# Blackout Roadmap

The canonical milestone tracker for the Black Market Coalition lives in
[`docs/AGGRESSIVE_OPERATIONS_GUIDE.md`](docs/AGGRESSIVE_OPERATIONS_GUIDE.md).
That document defines the four milestone tiers (Foundation, Differentiation,
Density, Infrastructure), their entry conditions and exit criteria, and the
master progress trackers for FBM, Blackout, and cross-cutting workstreams.

This file exists as a stable companion-doc target. It does not duplicate the
operations guide; it points at it.

## What lives where

| Surface                                                 | Path                                                                                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Milestone tiers, exit criteria, master progress tracker | [`docs/AGGRESSIVE_OPERATIONS_GUIDE.md`](docs/AGGRESSIVE_OPERATIONS_GUIDE.md)                                               |
| Cross-repo consolidation decisions and roadmap          | `docs/REPO_CONSOLIDATION_REVIEW.md` in `Blackmarket-coa/free-black-market` (local: [`CONSOLIDATION.md`](CONSOLIDATION.md)) |
| Single-server production runbook                        | [`infra/single-server-baseline/RUNBOOK.md`](infra/single-server-baseline/RUNBOOK.md)                                       |
| SLO dashboards, on-call escalation, secrets break-glass | [`docs/operations/`](docs/operations/)                                                                                     |
| Incident playbooks                                      | [`docs/runbooks/`](docs/runbooks/)                                                                                         |

## Current focus

The most recently landed workstreams (analytics, VOD recording, clips,
proximity, feed quick-wins) are tracked with their file-level status in
[`OSS_GAP_FILL_BUILD_PLAN.md`](OSS_GAP_FILL_BUILD_PLAN.md#status-update--2026-07-11).
Historical build plans and superseded design docs live in
[`docs/archive/`](docs/archive/README.md).

## FBM-side companions

The cooperative-economic substrate lives in the FBM repository at
`Blackmarket-coa/free-black-market`. Authoritative FBM-side prioritization is
tracked in `FEATURE_BUILD_PLAN.md` and `docs/VENDOR_PORTAL_PROJECT_TRACKER.md`
in that repository. The unified operations guide above sequences and frames
those tracker artifacts; it does not replace them.

Three items in FBM's `docs/CDFI_COOP_ROADMAP.md` name Blackout-side work and
are recorded there rather than duplicated here. **The first shipped on
2026-09-08**: a den founding document now exports as a Markdown file a vendor
can upload to FBM's document vault as a `governing_document` (§3.4), the seed
`attribution` and its licence are rendered in the editor rather than only
living in the template data, and the Documents tab gained a way to add a
document — which a Circle or Grove needed, because `SEEDS` gives bylaws to
Workshop, Commons, Local, Confluence and Order but not to those two, so a
circle that later decided to incorporate had no route to bylaws inside the
tool built for it. Markdown rather than PDF: the bodies are already Markdown,
it needs no rendering dependency, and a document whose purpose is to be
amended should arrive editable. Two things surfaced while doing it — the
reveal copy already claimed users "can author documents from scratch in the
Documents tab", which was untrue until now; and the mutual-aid seed is
CC BY-NC, so the editor now says so and tells a trading co-op to raise it with
the legal review rather than pretending to resolve whether that counts as
commercial use. Still open: the Grove playbook's
`FBM-HOUR` onboarding grant, which has no FBM counterpart until the time-bank
rail is lit (§3.10 — the reveal copy was softened on 2026-09-07 to say the
grant is planned rather than credited; the grant amount, the `FBM-HOUR` name
and any ledger behind it still wait on FBM lighting the rail); and a
mutual-aid event pair on the FBM→Blackout webhook contract so aid boards can
mirror FBM asks (§3.8). The legal review of the
four seed templates, already noted in `templates/index.ts` as a parallel
content task, needs an owner.
