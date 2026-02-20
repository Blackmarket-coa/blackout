# Distributed Self-Healing Blueprint (Community-Operated)

This blueprint defines a practical target architecture for a **self-healing, decentralized, encrypted, lightweight federation system** that can run on low-power nodes (including recycled Android phones via Termux). It is implementation-oriented and compatible with incremental adoption.

---

## 1) Architectural diagram (text form)

```text
                        ┌───────────────────────────────────────────────┐
                        │            Federation Control Plane           │
                        │ DID identities • seed list • trust policies  │
                        └───────────────────────────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
      ┌───────▼────────┐      ┌───────▼────────┐      ┌───────▼────────┐
      │ Node A         │◄────►│ Node B         │◄────►│ Node C         │
      │ (Phone/VM)     │Gossip│ (Phone/VM)     │Gossip│ (Phone/VM)     │
      ├────────────────┤      ├────────────────┤      ├────────────────┤
      │ API Gateway    │      │ API Gateway    │      │ API Gateway    │
      │ Peer Manager   │      │ Peer Manager   │      │ Peer Manager   │
      │ Event Store    │      │ Event Store    │      │ Event Store    │
      │ Snapshot Eng.  │      │ Snapshot Eng.  │      │ Snapshot Eng.  │
      │ CRDT Engine    │      │ CRDT Engine    │      │ CRDT Engine    │
      │ Crypto Layer   │      │ Crypto Layer   │      │ Crypto Layer   │
      ├────────────────┤      ├────────────────┤      ├────────────────┤
      │ SQLite/Badger  │      │ SQLite/Badger  │      │ SQLite/Badger  │
      │ Encrypted blobs│      │ Encrypted blobs│      │ Encrypted blobs│
      └────────────────┘      └────────────────┘      └────────────────┘
              │                       │                       │
              └────────── WebRTC / WebSocket / HTTP bootstrap ──────────┘
```

---

## 2) Folder structure (target modularization)

```text
core/
  event_store/
  snapshot_engine/
  state_rebuilder/
  compatibility/
network/
  peer_manager/
  gossip/
  transport_webrtc/
  transport_ws/
  bootstrap_http/
crypto/
  identity/
  key_exchange/
  ratchet/
  envelope/
governance/
  voting/
  policy/
tasks/
  workflow/
  claims/
ledger/
  internal_token/
  escrow/
  multisig/
streaming/
  p2p_mesh/
  sfu_fallback/
docs/
  termux_setup.md
  low_memory_mode.md
  migration_plan.md
```

---

## 3) Refactor checklist

- [ ] Adopt append-only event log with hash-linked records.
- [ ] Add CRDT state layer (Yjs/Automerge) for deterministic merge.
- [ ] Implement snapshot + replay recovery flow.
- [ ] Add peer replication and configurable replication factor.
- [ ] Implement gossip peer discovery with static seed fallback.
- [ ] Add DID-style public-key identity (Ed25519 signing).
- [ ] Add X25519 + AES-GCM encrypted payload envelopes.
- [ ] Add double-ratchet messaging paths for chat forward secrecy.
- [ ] Add vote/task/bounty/stream event types and handlers.
- [ ] Add low-memory mode profile (<1GB RAM target).
- [ ] Add Docker and Termux deployment guides.
- [ ] Provide compatibility layer and migration scripts.

---

## 4) Example event schema

```json
{
  "eventId": "01J...",
  "eventType": "MESSAGE_CREATED",
  "timestamp": 1735689600000,
  "actorPublicKey": "ed25519:...",
  "signature": "base64sig",
  "encryptedPayload": "base64ciphertext",
  "previousHash": "sha256:...",
  "contentHash": "sha256:...",
  "roomId": "room:alpha",
  "crdtClock": "lamport:12345"
}
```

Validation rules:

1. Verify signature against `actorPublicKey`.
2. Verify `previousHash` chain continuity.
3. Verify payload integrity (`contentHash`).
4. Apply CRDT operation deterministically.

---

## 5) Example CRDT integration snippet

```ts
// Pseudocode (TypeScript style)
import * as Y from "yjs";

const doc = new Y.Doc();
const messages = doc.getArray("messages");

export function applyEvent(event: FederatedEvent) {
  assertValidHashChain(event);
  assertValidSignature(event);

  const op = decryptAndDecode(event.encryptedPayload);
  doc.transact(() => {
    messages.push([op]);
  }, event.eventId);
}

export function snapshotState() {
  return Y.encodeStateAsUpdate(doc);
}
```

---

## 6) Example encrypted message flow

1. Sender resolves recipient room public keys.
2. Sender performs X25519 key agreement for session material.
3. Sender derives per-room symmetric key (ratchet step for chats).
4. Payload is encrypted with AES-GCM.
5. Sender signs event metadata with Ed25519.
6. Node stores only encrypted blob + metadata hash chain.
7. Recipient fetches encrypted event, verifies signature/hash, decrypts.

Design invariant: **server nodes never require plaintext access**.

---

## 7) Node boot sequence

1. Start in low-memory mode defaults when device profile is constrained.
2. Load node keys and DID identity.
3. Initialize embedded store (SQLite/LiteFS/BadgerDB).
4. Load latest snapshot checkpoint.
5. Replay local append-only log from checkpoint.
6. Join gossip network using seed nodes.
7. Sync missing event ranges from peers.
8. Validate hash chain and signatures.
9. Rebuild CRDT materialized state.
10. Announce healthy and begin relay/replication/signaling duties.

---

## 8) Recovery sequence (self-healing)

When a node fails:

- Peers continue appending events and replicating encrypted blobs.
- Periodic snapshots are retained with retention policy.

When node returns:

1. Request missing hash ranges from peers.
2. Verify continuity and cryptographic signatures.
3. Backfill missing encrypted payloads.
4. Replay events into CRDT engine.
5. Recompute materialized views (chat, voting, tasks, ledger).
6. Rejoin federation and advertise capacity.

Stateless replacement is supported by restoring identity keys (or rotating identity with trust update), then replaying snapshot + log.

---

## 9) Performance optimization notes

- Target binary protocol (CBOR or Protobuf) for high-volume replication.
- Batch event propagation and acknowledgments.
- Use lazy history sync (hash-range pagination).
- Keep hot indexes in memory; spill cold history to compact embedded storage.
- Use adaptive sync windows for unstable mobile nodes.
- Isolate SFU fallback as optional lightweight service (mediasoup/Pion).
- For 10k+ concurrent users per federation cluster, scale horizontally by room partitioning and replication-factor tuning.

Phone-hostable profile:

- Memory target: 512MB–1GB RAM.
- CPU-aware background compaction.
- Disk quotas for encrypted blobs + snapshot pruning.

---

## 10) Security audit checklist

- [ ] Ed25519 signatures validated for all event types.
- [ ] Hash-chain tamper checks enforced at ingest.
- [ ] X25519 key exchange implemented with key rotation policy.
- [ ] AES-GCM nonce management is safe and unique.
- [ ] Double-ratchet path tested for forward secrecy.
- [ ] Servers store only encrypted payloads, not plaintext.
- [ ] Replay and duplication attacks are rejected.
- [ ] Snapshot integrity signatures verified before restore.
- [ ] Multi-sig release logic tested for bounty escrow.
- [ ] Incident response and key compromise runbooks are documented.

---

## Core feature mapping

### Large group chats

- Room-level CRDT with partial sync and lazy loading.
- Hash-range pagination for message history.
- Offline-first reconciliation.
- Role-based moderation events.

### Robust voting

- `PROPOSAL_CREATED`, `VOTE_CAST`, `VOTE_CLOSED` events.
- Signed ballots and verifiable tally replay.
- Optional anonymous mode and weighted policy module.

### Work allocation

- `TASK_CREATED`, `TASK_CLAIMED`, `TASK_STATUS_CHANGED` events.
- Skill tags, deterministic status transitions, DAO-policy hooks.

### Bounty system

- Internal signed ledger with Merkle proofs.
- Escrow and multi-sig release events.
- Proof-of-work submission records + reputation updates.

### Streaming

- WebRTC mesh by default; optional SFU fallback.
- Encrypted stream metadata and transport keys.

---

## Networking model

### Layer 1: Identity + federation

- Public-key identity, DID-style identifiers.
- No central auth dependency.

### Layer 2: Peer discovery

- Gossip protocol + distributed peer table.
- Seed nodes as bootstrap fallback.

### Layer 3: Data transport

- WebRTC for high-bandwidth group transfer.
- WebSocket fallback for constrained networks.
- Minimal HTTP bootstrap endpoints.

---

## Migration plan (non-breaking)

1. Introduce compatibility layer that mirrors current writes into the new event store.
2. Backfill existing state into signed event streams.
3. Enable read-path dual mode (legacy + event-derived).
4. Switch feature-by-feature to event-derived state.
5. Enable snapshots, then peer replication.
6. Turn on strict cryptographic validation after soak period.

---

## Optional advanced enhancements

- Tor hidden service mode for node endpoints.
- NAT traversal automation for mobile peers.
- LAN-only federation mode.
- Offline QR-based sync handoff.
- Emergency read-only failover mode.

## Project completion tracker

Track implementation status in `docs/project_completion_tracker.md`.
