# Blackout Reuse Strategy Completion Tracker

This tracker captures work that still needs to be completed from the reuse strategy.

Legend:
- ✅ Complete
- 🟡 In progress / partial
- ⬜ Not started

## Overall status snapshot

| Area | Status | Notes |
| --- | --- | --- |
| Matrix backbone | ✅ | Already core platform. |
| CRDT (Yjs + y-indexeddb) | ✅ | Core document manager and persistence are present. |
| Governance lifecycle + voting | 🟡 | Basic engines exist; needs Matrix/Yjs persistence and production rules. |
| Deliberation clustering | ⬜ | Service exists as a placeholder; no algorithm implementation yet. |
| Delegation / liquid democracy | 🟡 | Graph and delegated tally exist; needs persistence, policy, and UX hardening. |
| Education module | 🟡 | Models exist; home view is currently empty. |
| Mutual aid board | 🟡 | Task board model exists; home view is currently empty. |
| IPFS storage | ⬜ | Service is a stub and currently reports unconfigured. |
| Sortition / random jury | ⬜ | No dedicated implementation found yet. |

---

## 1) Governance engine hardening (Loomio-inspired)

Status: 🟡

### Remaining tasks
- [ ] Persist proposal lifecycle state to Matrix room events (not only local component state).
- [ ] Back proposal and vote documents with CRDT snapshots keyed by room + proposal IDs.
- [ ] Add quorum/threshold policy support (simple majority is currently hardcoded).
- [ ] Add amendment history and audit timeline.
- [ ] Add role/permission checks tied to room membership and power levels.
- [ ] Add migration/version handling for governance document schemas.

### Exit criteria
- Proposal and voting state survive reload/device switch.
- Governance decisions can be verified from room history + CRDT state.

---

## 2) Deliberation clustering (Pol.is-inspired algorithm layer)

Status: ⬜

### Remaining tasks
- [ ] Implement clustering algorithm in `src/services/deliberation/clustering.ts`.
- [ ] Define input/output schema for opinion vectors and cluster metadata.
- [ ] Add tests with realistic synthetic data (small/medium/large room sizes).
- [ ] Add UI integration in governance proposal detail flow.
- [ ] Add safeguards for sparse datasets and adversarial input.

### Exit criteria
- Cluster results are deterministic and explainable.
- Proposal detail can display cluster summaries for large debates.

---

## 3) Delegation system completion (DemocracyOS-inspired semantics)

Status: 🟡

### Remaining tasks
- [ ] Persist delegation graph state to Matrix/CRDT rather than in-memory only.
- [ ] Add per-topic and global delegation precedence rules.
- [ ] Implement explicit vote override semantics (direct vote overrides delegated vote).
- [ ] Add revocation windows and historical delegation audit trails.
- [ ] Add moderation/abuse controls for delegation spam loops.

### Exit criteria
- Delegation behavior is stable across reloads and clients.
- Delegation attribution is auditable and policy-compliant.

---

## 4) Education module build-out

Status: 🟡

### Remaining tasks
- [ ] Replace placeholder home view with curriculum/study-circle UI.
- [ ] Bind `StudyCircleDocument` and `CurriculumDocument` to Yjs docs.
- [ ] Add collaborative section editing and conflict-safe merges.
- [ ] Add module navigation between study circles, lessons, and resources.
- [ ] Add access policy checks for room-scoped curricula.

### Exit criteria
- Users can create/edit study circles and curriculum content collaboratively.

---

## 5) Mutual aid board build-out (Kanban-style transitions)

Status: 🟡

### Remaining tasks
- [ ] Replace placeholder home view with board UI.
- [ ] Implement `todo -> doing -> done` transitions with validation rules.
- [ ] Bind board state to Yjs for concurrent edits.
- [ ] Add room-scoped filters (needs/offers, assignee, urgency).
- [ ] Add event/audit rendering for assignment and completion changes.

### Exit criteria
- Multiple members can manage shared needs/offers board in real time.

---

## 6) IPFS service integration

Status: ⬜

### Remaining tasks
- [ ] Implement real `IpfsService` configuration and health checks.
- [ ] Add upload flow returning CID and metadata.
- [ ] Add download/resolve flow by CID.
- [ ] Store CID references in Matrix room state/events.
- [ ] Add feature-flag-driven UX for unavailable IPFS backends.

### Exit criteria
- Users can upload and resolve shared assets via CID from within Blackout flows.

---

## 7) Sortition / random jury selection

Status: ⬜

### Remaining tasks
- [ ] Define sortition policy (input seed fields, eligibility filters).
- [ ] Implement deterministic selection function.
- [ ] Add reproducibility proof output (seed + hash details).
- [ ] Integrate selection results into governance proposal process.
- [ ] Add fairness tests and edge-case handling.

### Exit criteria
- Jury selections are deterministic, reproducible, and auditable.

---

## 8) Cross-cutting productionization tasks

Status: ⬜

### Remaining tasks
- [ ] Add end-to-end tests for governance + delegation + voting lifecycle.
- [ ] Add telemetry/events for key module outcomes and failures.
- [ ] Add localization strings for new module UIs.
- [ ] Add migration docs for existing rooms/users.
- [ ] Add threat model + abuse case review for governance and delegation flows.
- [ ] Add performance budget checks for large-room proposal activity.

### Exit criteria
- All new modules meet reliability, observability, localization, and security baselines.

---

## Suggested execution order

1. Governance persistence (Matrix + CRDT)
2. Voting policy hardening + delegated vote semantics
3. Education and mutual aid UI completion
4. IPFS implementation
5. Deliberation clustering
6. Sortition + final production hardening
