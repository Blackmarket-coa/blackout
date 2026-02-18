# Blackout P2P Data Plane Migration Plan

This document captures the incremental migration strategy for moving Blackout to:

- **Matrix as control plane** (identity, membership, signaling, key discovery)
- **WebRTC as data plane** (messages/files/chunk sync)

while preserving existing custom feature work until each phase is production-ready.

## Goals

1. Keep current Matrix event/message flow intact until the P2P stack is complete.
2. Ship the new architecture behind a labs flag (`feature_blackout_p2p_data_plane`).
3. Avoid regressions for existing Blackout custom features.

## Control plane vs data plane

### Matrix control plane

- Account + device identity
- Room membership and peer discovery
- Signaling payloads (`m.blackout.signal`) for ICE/candidates/session metadata
- Minimal message metadata references

### WebRTC data plane

- Encrypted message payload transport
- Chunk/file transfer
- Inventory exchange + gossip replication

## Phased rollout

### Phase 0 (this change): scaffolding only

- Add `src/p2p/` core abstractions:
  - `RTCTransport` (peer channel registry + broadcast)
  - `RoomMesh` (chunk inventory + missing-hash computation)
  - `PeerManager` (room-level orchestration)
- No timeline send behavior changes.
- Labs flag added but no end-user transport switch yet.

### Phase 1: dual-write signaling

Status: **in progress** (attachment metadata dual-write is now wired behind the labs flag while timeline payloads still use Matrix).

- Continue sending `m.room.message` as today.
- Add parallel `m.blackout.signal` events containing message/file metadata only (first send-path integration currently covers attachment sends):
  - `message_id`
  - `hash`
  - `size`
  - `content_type`
- Introduce local encryption + hash generation pipeline.

### Phase 2: optional P2P delivery (feature gated)

- On flagged clients, attempt WebRTC first for payload delivery.
- Maintain Matrix fallback path to prevent data loss.
- Persist payload/chunks in IndexedDB and sync on reconnect.

### Phase 3: metadata-only Matrix timeline

- Switch flagged rooms/clients to metadata-only Matrix events.
- Payload reconstruction from local + peers via chunk gossip.
- Add redundancy target policy (default: 3 peers per chunk).

### Phase 4: large file swarm behavior

- Direct stream for online peers.
- Offline retrieval through chunk holders.
- Merkle-root verification for integrity.

## Data safety principles

- No irreversible cutover until parity checks pass.
- Keep backward compatibility during migration window.
- Add per-room kill switch to disable P2P data plane instantly.

## Next implementation steps

1. Wire `PeerManager` lifecycle to room membership changes.
2. Reuse call signaling channel for RTCDataChannel establishment.
3. Define `m.blackout.signal` schema + validation.
4. Add IndexedDB chunk store with room-scoped namespaces.
5. Add end-to-end tests for offline/online sync behavior.
