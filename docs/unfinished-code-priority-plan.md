# Unfinished Code Priority Plan (Aligned to Blackout Frontend Architecture)

This plan aligns unresolved TODO/FIXME markers with the Blackout frontend direction:

- Matrix transports **metadata-only signal events**.
- Message/file payloads move to **local encryption + WebRTC P2P** paths.
- Storage and replication become **chunked, local-first, and gossip-driven**.

## Inputs

- Completion tracker baseline: `docs/blackout-reuse-completion-tracker.md`.
- Unfinished marker inventory: `docs/unfinished-code-checklist.md`.
- Target architecture: Blackout frontend plan (metadata-only Matrix events, room mesh RTC data channels, distributed chunk storage/replication, encrypted attachments, direct large-file transfer).

## Alignment principles (what changes in prioritization)

1. **Messaging correctness now means metadata correctness**
   - Matrix events must carry only routing/integrity fields (`message_id`, `hash`, `size`, content type).
2. **Transport reliability shifts to WebRTC mesh health**
   - Peer discovery/reconnect/inventory sync paths are now critical-path functionality.
3. **Storage integrity is hash/chunk/Merkle based**
   - Local chunk lifecycle and verification become P0/P1 depending on user-impact surface.
4. **UI TODOs are sequenced by impact on P2P rollout safety**
   - Error handling, event scoping, and encoded-ID routing remain high priority because they gate operability of deeper P2P work.

## Workstream mapping to the 6 architecture tracks

### 1) Disable server message persistence (metadata-only Matrix events)

**Priority:** P0

- Extend existing event-send TODO handling to enforce `m.blackout.signal`-style metadata events.
- Immediate tie-ins from current backlog:
  - `src/components/structures/TimelinePanel.tsx` L893 (event-scope guard).
  - `src/components/structures/MatrixChat.tsx` L1937 (encoded room/event IDs).
  - `src/components/structures/MatrixChat.tsx` L318 (explicit error state for rejected/invalid signal payloads).

### 2) WebRTC mesh messaging layer (`src/p2p/`)

**Priority:** P0

- Add foundational modules:
  - `src/p2p/peerManager.ts`
  - `src/p2p/rtcTransport.ts`
  - `src/p2p/roomMesh.ts`
- Reuse existing call signaling where practical; decouple from call-only assumptions.
- Backlog tie-ins:
  - `src/Notifier.ts` L491 (replace one-call-per-room assumptions with ID-scoped targeting concepts that also apply to per-peer RTC sessions).
  - `src/LegacyCallHandler.tsx` L586 and `src/components/structures/LegacyCallEventGrouper.ts` L95 (legacy call semantics cleanup to avoid conflicts when RTC is used for both calls and messaging transport).

### 3) Split + distributed local storage (message/file chunks)

**Priority:** P1

- Add chunk model standards (256KB chunking, SHA-256 per chunk, Merkle root for file payload sets).
- IndexedDB room/chunk namespace strategy should be documented and tested.
- Backlog tie-ins:
  - `src/SendHistoryManager.ts` L30 (performance concern likely amplified under local-first persistence).
  - `src/components/structures/ScrollPanel.tsx` L648 (binary search TODO helps timeline scalability with chunk-backed history growth).

### 4) Gossip replication (inventory exchange + redundancy targets)

**Priority:** P1

- Define room-level replication policy defaults (target redundancy >= 3, configurable).
- Add sync protocol lifecycle: inventory exchange, missing-hash requests, chunk transfer, convergence checks.
- Backlog tie-ins:
  - `src/components/structures/MatrixChat.tsx` L183 (state consistency TODO is relevant for bursty gossip updates).
  - `src/components/structures/MessagePanel.tsx` L468 (granular controls can evolve into per-room replication/retention visibility).

### 5) Encrypted file attachments (Matrix metadata + P2P data plane)

**Priority:** P0/P1 boundary (start in P0 for safety)

- Enforce no-server-blob rule: Matrix stores only metadata (Merkle root, file metadata, key reference ID).
- Add attachment encryption workflow and key wrapping integration before broad UI exposure.
- Backlog tie-ins:
  - `src/ScalarMessaging.ts` L192/L211 and `src/TextForEvent.tsx` L917 (`m.widget` support should not block attachment metadata events but may need compatibility mapping).
  - `src/components/structures/ViewSource.tsx` L44 (update event header semantics for new metadata-centric events).

### 6) P2P direct transfer for large files

**Priority:** P1

- Prefer direct RTC streaming when peers are online; fallback to replicated chunk retrieval when offline.
- Add transfer mode telemetry and UX states (direct, fallback swarm, unavailable).
- Backlog tie-ins:
  - `src/components/structures/MatrixChat.tsx` L318 (error screen requirement is critical for transfer-mode failures).
  - `src/async-components/views/dialogs/security/ImportE2eKeysDialog.tsx` L110 (feedback patterns should be mirrored in transfer/import status UX).

## Updated TODO/FIXME execution order (architecture-aligned)

### P0 — rollout blockers

1. Matrix metadata-event safety rails (event scope + encoded-ID handling + explicit invalid-signal error states).
2. RTC mesh foundation (`peerManager`, `rtcTransport`, `roomMesh`) with reconnect semantics.
3. Notifier/call-path ID correctness (`call_id` and peer/session targeting assumptions).
4. Legacy call/event grouping cleanup to prevent signaling-path ambiguity.
5. Attachment metadata-only guardrails + encryption pipeline skeleton.

### P1 — scale and resilience

6. Chunking + hash/Merkle local storage implementation and tests.
7. Gossip replication protocol + redundancy policy configuration.
8. Timeline/scroll/history performance fixes (binary search + send history profiling).
9. Direct-transfer mode + swarm fallback UX and telemetry.
10. Product controls and compatibility layers (message panel granularity, widget/event integration where required).

### P2 — maintenance/debt

11. Scalar naming generalization and API namespacing cleanup.
12. Auth/registration and legacy compatibility retirement TODOs.
13. Low-risk UI wording/cleanup items.

## Suggested delivery cadence

- **Sprint A (P0):** metadata-only event contract + RTC mesh skeleton + correctness/error rails.
- **Sprint B (P1):** chunk store + gossip replication + performance hardening.
- **Sprint C (P1/P2):** direct-transfer polish, compatibility, and debt retirement.

## Definition of done for this plan

- Message bodies are no longer persisted to Matrix events in standard send flows.
- Room-level RTC mesh reliably exchanges encrypted payloads with reconnect behavior.
- File/message chunk verification succeeds via hash checks and Merkle-root validation.
- Replication policy converges to configured redundancy target in routine peer churn.
- UI clearly communicates transfer/sync/error states for metadata-only + P2P operation.
