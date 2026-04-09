# Presence Service Specification

## Purpose

Define a consistent, privacy-aware presence model for Blackout clients and services so users can reliably see whether contacts are **online**, **away**, or **offline**.

## Status model

Presence is represented by `presence_state` with exactly three values:

- `online`: user is actively connected and recently active.
- `away`: user is connected but idle beyond the away threshold.
- `offline`: user has no active session heartbeat, or visibility policy hides a more specific state.

### State precedence

When multiple sessions are active for one account:

1. If any visible session is `online`, account state resolves to `online`.
2. Else if any visible session is `away`, account state resolves to `away`.
3. Else account state resolves to `offline`.

## Heartbeat and timing

### Client heartbeat contract

- Clients send presence heartbeats while authenticated and foregrounded.
- Standard heartbeat interval: **30 seconds**.
- Background/mobile power-save interval: **90 seconds**.
- Heartbeats include:
  - `user_id`
  - `session_id`
  - `last_activity_at` (server-normalized timestamp)
  - optional `client_state` (`foreground` or `background`)

### Server thresholds

- `away_after`: **5 minutes** without activity update.
- `offline_after`: **2.5 × heartbeat interval** for the session profile (75s for standard, 225s for background).
- `hard_expire_after`: **24 hours** after last heartbeat; stale rows can be archived/purged.

## Stale status handling

### Detection

A session becomes stale when `now - last_heartbeat_at > offline_after`.

### Reconciliation behavior

- Server-side recalculation runs on:
  - heartbeat writes,
  - explicit disconnect/logout,
  - periodic sweeper (every 60 seconds).
- If sweeper is delayed, clients must treat presence older than `offline_after` as `offline` for rendering.

### Failure modes and safe defaults

- If presence service is degraded/unreachable, UI defaults contacts to `offline` (fail closed, no false-online).
- On clock skew, server timestamps are authoritative; client clocks are ignored for state transitions.

## Privacy controls

Presence visibility is governed by `presence_visibility` policy per user.

### Policy values

- `everyone`: any authenticated user can view state.
- `contacts_only`: only mutually approved contacts can view state.
- `nobody`: nobody can view state; outward state appears `offline`.
- `allow_list`: only user-defined allow-list entries can view state.
- `block_list`: visible to eligible viewers except blocked users.

### Evaluation order

1. If viewer is blocked, return `offline`.
2. If policy is `nobody`, return `offline`.
3. If policy is `allow_list`, require viewer in allow-list; otherwise return `offline`.
4. If policy is `contacts_only`, require mutual contact relationship; otherwise return `offline`.
5. If policy is `everyone`, return computed state.

### Privacy guarantees

- Unauthorized viewers never receive hidden intermediate states (e.g., `away`) or heartbeat metadata.
- Presence queries and subscriptions are authz-checked per request and per stream reconnect.
- Policy changes take effect immediately for new reads and within one subscription tick (<= 5s target) for live watchers.

## Scalability assumptions

### Capacity assumptions (initial target)

- Registered users: up to **10 million**.
- Concurrently connected users: up to **1 million**.
- Average heartbeat cadence: **30–90s**, blended 45s effective.
- Expected sustained heartbeat ingest: ~**22k writes/sec** at 1M concurrent users.
- Presence read fanout: up to **200k subscription updates/sec** during peak transitions.

### Architecture assumptions

- Stateless presence API nodes behind load balancer.
- In-memory distributed store (e.g., Redis-compatible) for hot presence/session keys.
- Durable event log (or append stream) for audit/replay where required.
- Pub/sub channel for subscription fanout, partitioned by user shard.
- Sharding key: stable hash of `user_id`.

### Performance targets

- Heartbeat write p95: < 50 ms.
- Presence read p95: < 75 ms.
- State transition propagation (writer to subscriber) p95: < 3 s.
- Subscription reconnect recovery: < 5 s.

### Reliability targets

- Service availability: 99.95% monthly.
- No single-region single-node dependency for presence correctness.
- At-least-once delivery for transition events; idempotent consumer handling required.

## API surface (minimal)

- `PUT /v1/presence/heartbeat`
- `PUT /v1/presence/policy`
- `GET /v1/presence/:user_id`
- `POST /v1/presence/query` (batch)
- `GET /v1/presence/subscribe` (SSE/WebSocket)

## Non-goals (this spec revision)

- Rich activity text (e.g., “in a call”, “playing music”).
- Last-seen precision exposure to unauthorized users.
- Cross-network federation of presence semantics.
