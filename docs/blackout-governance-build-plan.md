# Blackout Governance/Education/Mutual-Aid Build Plan

> Progress is tracked in `docs/blackout-governance-completion-tracker.md`.

## 1) Goals and constraints

### Product goals

- Extend Blackout (Element/Matrix fork) with governance, education, and mutual-aid workflows.
- Keep Matrix rooms, accounts, and E2EE as the communication and identity backbone.
- Preserve upstream compatibility by avoiding deep forks of Element core flows.

### Engineering constraints

- Client-first architecture (no mandatory custom backend).
- Local-first shared state (offline edits + conflict-free merge).
- Incremental rollout behind feature flags.
- Reuse mature OSS logic where it reduces risk; avoid embedding heavy third-party UIs.

---

## 1.1) Strategic posture alignment

This governance plan supports the broader Blackout strategic posture:

- Keep governance participation frictionless to preserve value-first UX.
- Reinforce privacy/decentralization credibility through self-host and federation-ready architecture choices.
- Preserve category focus on cooperative governance + secure communication (avoid generalized productivity-suite sprawl).
- Prioritize moat compounding in sequence: steganography adoption -> governance trust -> federation network effects -> inter-community voting.

---

## 2) Reuse strategy (what to adopt vs what to avoid)

### Reuse directly

- **Yjs**: CRDT documents and subdocs.
- **y-indexeddb**: offline persistence.
- **libsodium** (or existing crypto wrappers): signatures and ballot encryption primitives.
- **IPFS/Kubo (optional)**: content-addressed large file distribution.

### Reuse by extracting/porting logic

- **Loomio**: proposal lifecycle and vote state transitions (logic only).
- **Pol.is**: clustering/grouping algorithm concepts for large deliberations.
- **DemocracyOS concepts**: delegation and vote-override behavior.
- **Kanboard concepts**: lightweight task board state transitions.

### Avoid embedding

- Full Decidim/Loomio/Moodle/Snapshot/blockchain DAO stacks.
- Any heavy external UI that duplicates Matrix client UX.

---

## 3) Target architecture inside this repo

## 3.1 New domain modules

Create domain-first modules under `src/modules` and `src/services`:

```text
src/
  modules/
    governance/
      components/
      views/
      models/
    education/
      components/
      views/
      models/
    mutualAid/
      components/
      views/
      models/
  services/
    crdt/
    governance/
    delegation/
    deliberation/
    storage/
    attestations/
```

## 3.2 Matrix as source of coordination

- Use Matrix room IDs as scope keys for all shared documents.
- Persist per-room document metadata in Matrix state events (e.g. custom `im.blackout.doc`).
- Continue using Matrix room membership for authorization boundaries.

## 3.3 CRDT document model

- One Y.Doc per high-level collaboration unit (proposal, study circle, task board).
- Shared maps/arrays for deterministic object storage and audit metadata.
- IndexedDB persistence enabled by default; optional network provider toggled by room type.

---

## 4) Implementation phases

## Phase 0 — Discovery and scaffolding (1 sprint)

### Deliverables

- Feature flag set for governance/education/mutual aid.
- Domain module skeletons under `src/modules/*`.
- Service skeletons under `src/services/*`.
- Baseline ADR describing Matrix+Yjs architecture.

### Tasks

1. Inventory existing routing, nav, room rendering extension points.
2. Add top-level feature flags + guard clauses.
3. Define initial TypeScript interfaces for proposal, vote, delegation, task, study-circle docs.
4. Add telemetry hooks for module adoption and error rates.

### Exit criteria

- Modules compile with no behavior changes when flags are off.

---

## Phase 1 — CRDT core (Yjs) (1–2 sprints)

### Deliverables

- `src/services/crdt/documentManager.ts`
- `src/services/crdt/yjsProvider.ts`
- `src/services/crdt/types.ts`
- Matrix state binding for document IDs

### Tasks

1. Implement document lifecycle API: `open(roomId, docType)`, `close`, `syncState`, `snapshot`.
2. Add y-indexeddb persistence keyed by `{roomId}:{docType}`.
3. Define room state event schema for doc metadata and version.
4. Add migration/versioning strategy for doc schema changes.

### Exit criteria

- Two clients in same room converge on document state.
- Offline edits replay and merge after reconnect.

---

## Phase 2 — Governance MVP (Loomio-inspired) (2 sprints)

### Deliverables

- `src/services/governance/ProposalEngine.ts`
- `src/services/governance/VotingEngine.ts`
- `src/modules/governance/components/*`
- Proposal room/view integration

### Tasks

1. Implement proposal lifecycle state machine:
    - Draft → Discuss → Amend → Close → Decide.
2. Implement vote methods:
    - Start with approval + simple majority tally.
3. Store proposal/vote objects in Yjs docs; emit summary events to Matrix for room history.
4. Add governance list/detail/create views and wire into navigation.

### Exit criteria

- Users can create proposals, discuss in room, vote, and see deterministic tallies.

---

## Phase 3 — Delegation + attestations (1 sprint)

### Deliverables

- `src/services/delegation/DelegationGraph.ts`
- `src/services/attestations/attestationGraph.ts`
- Delegation management UI in governance settings/profile area

### Tasks

1. Implement topic-scoped delegation graph with cycle detection.
2. Add vote override rule: direct vote supersedes delegated vote.
3. Add signed attestations for trust/credential edges.
4. Include explainability output for “why this vote weight applies”.

### Exit criteria

- Delegated voting produces deterministic results and clear audit trails.

---

## Phase 4 — Education module (1 sprint)

### Deliverables

- `src/modules/education/components/StudyCircleList.tsx`
- `src/modules/education/components/StudyCircleRoom.tsx`
- `src/modules/education/components/CurriculumEditor.tsx`

### Tasks

1. Add study-circle room creation flow and tagging.
2. Back shared notes/curriculum with Yjs documents.
3. Add markdown export/import for portability.

### Exit criteria

- Study circles support real-time shared notes with offline merge.

---

## Phase 5 — Mutual aid board (1 sprint)

### Deliverables

- `src/modules/mutualAid/components/NeedsBoard.tsx`
- `src/modules/mutualAid/components/OffersBoard.tsx`
- `src/modules/mutualAid/models/TaskBoard.ts`

### Tasks

1. Implement board states (Backlog/In-Progress/Done) and transitions.
2. Add matching hints between needs/offers.
3. Persist board state with Yjs and scope to Matrix room.

### Exit criteria

- Communities can post needs/offers and track progress in shared boards.

---

## Phase 6 — Deliberation clustering (optional, 1 sprint)

### Deliverables

- `src/services/deliberation/clustering.ts`
- Governance UI panel for “opinion groups” and consensus pockets

### Tasks

1. Port/adapt Pol.is-like clustering algorithm for proposal comment/vote vectors.
2. Add privacy-preserving aggregation mode (no raw ballot exposure).
3. Add feature flag to limit to large rooms first.

### Exit criteria

- Large-room proposals expose meaningful opinion clusters without leaking private ballots.

---

## Phase 7 — IPFS storage integration (optional, 1 sprint)

### Deliverables

- `src/services/storage/ipfsService.ts`
- Attachment pipeline for CID upload/retrieval

### Tasks

1. Add optional IPFS provider config.
2. Upload large resources; store CID references in Matrix state/messages.
3. Add pinning strategy docs and graceful fallback when IPFS unavailable.

### Exit criteria

- Large assets can be distributed by CID while preserving Matrix-native references.

---

## 5) Cross-cutting requirements

### Security

- Reuse Matrix E2EE rooms where possible.
- Sign proposal updates and vote envelopes with device keys/libsodium.
- Keep private ballots encrypted at rest in local persistence where applicable.

### Performance

- Lazy-load module bundles and heavy algorithms.
- Bound CRDT doc sizes with archive/snapshot strategy.
- Add room-level pagination and debounce for high-frequency updates.

### UX

- Add nav entries for Governance, Education, Mutual Aid.
- Room-type aware rendering: tagged rooms can show domain views with chat context preserved.
- Keep chat fallback available to avoid dead-end UIs.

### Upstream compatibility

- Avoid touching Element core primitives unless required.
- Prefer extension points, wrappers, and feature flags.
- Keep diff localized to new module/service directories.

---

## 6) Testing plan

### Unit tests

- CRDT adapters, schema migration, and merge invariants.
- Proposal state machine and vote tallies.
- Delegation graph cycle handling and override semantics.
- Task board transition rules.

### Integration tests

- Multi-client sync across one Matrix room.
- Offline edit + reconnect reconciliation.
- Proposal lifecycle end-to-end (create → discuss → vote → close).

### UI/e2e tests

- Navigation to each module with flags on/off.
- Governance creation and voting flows.
- Study circle collaborative editing and mutual aid board updates.

### Non-functional checks

- Bundle size impact per module.
- Long-session memory behavior for active Yjs docs.
- Error and latency telemetry thresholds.

---

## 7) Delivery model and governance

### Feature flags

- `feature_governance`
- `feature_education`
- `feature_mutual_aid`
- `feature_deliberation_clustering`
- `feature_ipfs_storage`

### Suggested rollout

1. Dogfood in one internal community room.
2. Expand to invite-only pilot spaces.
3. Default-on for new rooms; opt-in for existing rooms.

### Success metrics

- Proposal completion rate.
- Median time-to-decision.
- Study-circle weekly active participants.
- Mutual-aid task completion ratio.
- Sync conflict/error rate per room.

---

## 8) First 30-day execution checklist

Week 1

- Finalize ADR + schemas.
- Scaffold module/service directories.
- Add flags and navigation placeholders.

Week 2

- Ship CRDT document manager + IndexedDB persistence.
- Wire Matrix room-state metadata for document IDs.

Week 3

- Implement governance proposal lifecycle + approval voting.
- Add proposal list/detail/create UI.

Week 4

- Add delegation basics + tests.
- Pilot in one room and review telemetry.

---

## 9) Definition of done for MVP

- Governance module supports proposal creation, discussion linkage, voting, close, and result display.
- CRDT shared state works online/offline with deterministic merge.
- Delegation basics are available with clear override semantics.
- Feature remains optional, behind flags, with no regressions to baseline Matrix chat UX.
