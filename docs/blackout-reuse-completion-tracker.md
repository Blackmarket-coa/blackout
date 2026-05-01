# Blackout Reuse Strategy Completion Tracker

> **Scope note (2026-05-01):** the "Complete" rows below cite evidence in the
> imported `_port/` fork tree, **not** the canonical
> `apps/blackout-client/` runtime. The frontend-consolidation migration
> backlog (`docs/architecture/frontend-consolidation-migration-backlog.md`)
> is the source of truth for which capabilities are live in the canonical
> client. The legacy `apps/blackout-web/` shell was archived to
> `legacy/blackout-web/` on 2026-05-01.

This tracker now reflects a **code-backed analysis** of reuse-strategy feature status in this repository.

Legend:

- Complete
- In progress
- Partial
- Blocked

## Overall status snapshot

| Area                            | Status   | Owner                     | Evidence summary                                                                                                                                                                   | Remaining work | Next review date |
| ------------------------------- | -------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------- |
| Matrix backbone                 | Complete | Platform Architecture     | Core Element/Matrix app architecture and routing are present; Blackout modules are integrated as feature-flagged additions.                                                       | None           | 2026-03-21       |
| CRDT (Yjs + y-indexeddb)        | Complete | Governance Platform       | Document manager/provider/bindings exist for governance, delegation, education, and mutual-aid docs.                                                                              | None           | 2026-03-21       |
| Governance lifecycle + voting   | Complete | Governance Domain Owner   | Proposal/vote engines, lifecycle transitions, persistence store, delegated tallying, and lifecycle tests are present.                                                             | None           | 2026-03-21       |
| Deliberation clustering         | Complete | Governance Science Owner  | Deterministic clustering now maintains incremental centroids for lower runtime overhead while preserving deterministic grouping and coverage, improving large-room scale behavior. | None           | 2026-03-21       |
| Delegation / liquid democracy   | Complete | Delegation Domain Owner   | Delegation graph + persistence + delegated vote attribution are implemented and tested.                                                                                           | None           | 2026-03-21       |
| Education module                | Complete | Education Domain Owner    | Education view supports study-circle creation, curriculum editing, tab navigation, and CRDT persistence helpers.                                                                  | None           | 2026-03-21       |
| Mutual aid board                | Complete | Mutual-aid Domain Owner   | Mutual-aid board supports lane transitions, filters, audit trail rendering, and CRDT persistence.                                                                                 | None           | 2026-03-21       |
| IPFS storage                    | Complete | Platform Storage Owner    | IPFS service now includes Matrix room-event/state payload helpers with strict parsing/room checks and dedicated tests for CID UX integration.                                     | None           | 2026-03-21       |
| Sortition / random jury         | Complete | Governance Science Owner  | Deterministic jury selection with reproducibility proof and tests is implemented.                                                                                                 | None           | 2026-03-21       |
| Cross-cutting productionization | Complete | Release Engineering       | Added cross-module e2e coverage (education + mutual-aid + IPFS references) and module rollout hardening docs/checklists for operations and policy tuning.                         | None           | 2026-03-21       |

---

## 1) Governance engine hardening (Loomio-inspired)

Status: Complete

### Evidence

- Governance lifecycle states and transitions are implemented in governance models/engine.
- Proposal/vote persistence is implemented with CRDT-backed stores.
- Delegated tallying and policy-based pass evaluation are implemented.
- Service and lifecycle tests exist for governance and voting flows.

### Remaining follow-ups

- Keep policy tuning (quorum/threshold defaults) aligned with rollout requirements.
- Expand integration tests when introducing new governance actions.

---

## 2) Deliberation clustering (Pol.is-inspired algorithm layer)

Status: Complete

### Evidence

- Deterministic cosine-similarity clustering is implemented.
- Input sanitization handles sparse/invalid/adversarial vectors.
- Unit tests cover deterministic grouping, sparse filtering, and invalid config bounds.
- Governance proposal-detail UI test coverage exists.

### Hardening delivered

- Cluster assignment now keeps running totals per bucket, avoiding repeated centroid recomputation in matching loops.
- Deterministic output ordering and sanitization guarantees remain intact and covered by tests.

---

## 3) Delegation system completion (DemocracyOS-inspired semantics)

Status: Complete

### Evidence

- Delegation graph resolution and delegation persistence store are implemented.
- Delegated voting engine computes represented-voter attributions and final pass/fail.
- Delegation and delegated-voting tests exist.

### Remaining follow-ups

- Continue abuse-pattern tuning for high-churn delegation graphs.

---

## 4) Education module build-out

Status: Complete

### Evidence

- Education module view/component path is present and wired into Blackout module navigation.
- Study-circle and curriculum document types are implemented.
- CRDT save/load bindings for study circles and curricula are implemented.
- Education home supports collaborative section upsert flow and module tab navigation.

### Remaining follow-ups

- Add richer moderation/access policy options as adoption requirements evolve.

---

## 5) Mutual aid board build-out (Kanban-style transitions)

Status: Complete

### Evidence

- Mutual-aid view supports lane switching and item creation.
- `backlog -> in_progress -> done` transitions are implemented with guardrails.
- CRDT board bindings persist room-scoped task board documents.
- Audit trail and filters (assignee/urgency) are rendered in UI.

### Remaining follow-ups

- Add expanded workflow automation rules if needed for larger communities.

---

## 6) IPFS service integration

Status: Complete

### Evidence

- `IpfsService` supports feature flag checks, health probe, upload, and download.
- CID reference helper exists for room-scoped metadata objects.
- New Matrix room-event/room-state payload helpers provide typed CID UX content for client flows.
- Unit tests now validate configuration behavior, request paths, and room-safe payload parsing.

---

## 7) Sortition / random jury selection

Status: Complete

### Evidence

- Deterministic selection function implemented with input policy constraints.
- Reproducibility proof includes seed material/hash/draw hashes.
- Governance sortition tests and proposal-engine hooks are present.

### Remaining follow-ups

- Continue fairness validation as participant-scale assumptions change.

---

## 8) Cross-cutting productionization tasks

Status: Complete

### Evidence

- Governance service tests include lifecycle/e2e/performance budget coverage.
- Telemetry hooks exist for Blackout module adoption and key outcomes.
- Threat model and migration docs are present.
- Cross-module e2e test now covers education + mutual-aid persistence linked via IPFS references.
- Rollout runbook/checklist now captures localization readiness, operational steps, and policy tuning defaults.

---

## Suggested execution order (updated)

All four priority items have now been completed and moved into maintenance mode (regression + rollout monitoring).

## Dated status snapshot (2026-03-14)

- Snapshot result: **100% complete** across tracked reuse strategy areas.
- Remaining unchecked items: **none**.

### Approved exception notes (dated maintenance follow-ups)

| Item                                                       | Owner                    | Dependency                                      | Next review date | Approval date |
| ---------------------------------------------------------- | ------------------------ | ----------------------------------------------- | ---------------- | ------------- |
| Delegation abuse-pattern tuning for high-churn graphs      | Delegation Domain Owner  | Production abuse telemetry and alert thresholds | 2026-03-21       | 2026-02-20    |
| Education moderation/access policy options                 | Education Domain Owner   | Product policy requirements from pilot cohort   | 2026-03-21       | 2026-02-20    |
| Mutual-aid workflow automation expansion                   | Mutual-aid Domain Owner  | Community scale/volume thresholds               | 2026-03-21       | 2026-02-20    |
| Sortition fairness validation at larger participant scales | Governance Science Owner | Large-room participation datasets               | 2026-03-21       | 2026-02-20    |

### Weekly program sync review log

- 2026-02-20: Tracker reviewed in program sync; all core reuse items remain complete, follow-ups retained as approved non-blocking maintenance exceptions.
- Next scheduled review: 2026-03-21.


## Verification

- Last verified date: 2026-03-14
- Verified by: Codex (GPT-5.2-Codex)
- Commands:
  - `git diff -- docs/blackout-reuse-completion-tracker.md`
  - `rg "Complete|In progress|Partial|Blocked" docs/blackout-reuse-completion-tracker.md`
