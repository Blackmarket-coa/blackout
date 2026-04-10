# Distributed self-healing blueprint (community-operated)

This guide translates the goal "hard to take down" into practical reliability engineering for Blackout Server deployments. It is intentionally implementation-oriented so operators can move from concept to rollout without inventing their own reliability framework.

## Reality check: "impossible to take down"

No system is literally impossible to disrupt. Design for:

- no single points of failure,
- fast automatic recovery,
- graceful degradation,
- and rapid operator intervention.

Use measurable targets (SLOs) instead of absolutes.

## Operating principles

- **Decentralize trust:** multiple independent operators and networks.
- **Fail closed for integrity, fail open for availability only where safe:** prioritize safety for auth, event signing, and moderation paths.
- **Automate first response:** page humans after an automated mitigation begins.
- **Practice disaster paths regularly:** drills are part of normal operations, not exceptional work.
- **Document ownership:** every alert has an owner, runbook, and escalation path.

## Target outcomes (SLO examples)

- API availability: 99.95% monthly.
- Federation send backlog recovers to normal within 15 minutes after a regional incident.
- Data durability: no permanent loss from single-node failure.
- Recovery objectives:
  - RPO <= 1 minute (WAL shipping / synchronous replication choice based on latency budget)
  - RTO <= 5 minutes for primary database failover.

Suggested error budgets:

- API availability 99.95%: ~21m 54s unavailability/month.
- Federation recovery SLO: max 4 missed recovery windows per month before a reliability freeze.

When error budget burn > 50% in a month, pause non-critical feature releases and prioritize resilience work.

## Architecture layers

## 1) Community distribution model (users as resilience)

Use multiple independently-operated homeservers (different operators, networks, and regions).
This prevents a single organization, data center, or ISP from taking out the whole community.

Operational implications:

- Keep federation enabled and healthy.
- Publish bootstrap/runbook docs so new operators can join quickly.
- Encourage at least 3 independent operators before calling a network "resilient".
- Rotate operator failover exercises so each operator proves recoverability quarterly.

## 2) Per-homeserver high availability

For each homeserver deployment:

- **Synapse workers** split request handling by role.
- **Redis** for replication/pub-sub and cache coherence.
- **PostgreSQL HA** (primary + replicas + automated failover).
- **Reverse proxy / load balancer** routing to healthy workers.

Design notes:

- Pin workers by role and cap concurrency to avoid noisy-neighbor collapse.
- Keep config and secrets externalized (env, secret manager, mounted config) for fast immutable rollbacks.
- Maintain N+1 capacity for each critical worker class.

### Recommended worker baseline

Start conservative, then scale by metrics:

- 2x generic workers for client API paths,
- 1x federation sender,
- 1x background worker,
- 1x event persister,
- main process for coordination.

Scale out with additional workers per bottleneck domain (`/sync`, federation, media, pushers).

## 3) Control plane and self-healing

Use one orchestrator style consistently:

- **Systemd** for VM/bare-metal deployments.
- **Kubernetes** for container-first environments.

Self-healing controls:

- liveness/readiness checks on every worker,
- auto-restart on process crash,
- anti-affinity for critical replicas,
- automatic database failover,
- automated rollback for bad deploys.

Minimum policy targets:

- Crash-loop detection < 60 seconds.
- Replacement worker scheduled < 2 minutes.
- Bad rollout rollback started < 5 minutes from detection.

## 4) Data safety and consistency

- Daily full backups + frequent incremental/WAL backups.
- Quarterly restore drills to a clean environment.
- Connection keepalives tuned to reduce long DB stalls during path failure.
- Capacity alerts on DB growth, purge lag, and replication lag.

Backup standards:

- Keep encrypted backups in at least 2 regions/providers.
- Define retention classes (e.g., 7 daily, 8 weekly, 12 monthly snapshots).
- Validate backup catalog integrity automatically (checksums + restore metadata).

## 5) Observability and auto-remediation

Use dashboards + alerting for:

- worker process health,
- DB replication lag and failover state,
- Redis availability and latency,
- federation retry/failure trends,
- event rejection rates (especially in blackout mode).

Automations to add:

- if federation destination repeatedly fails, auto-create incident annotation,
- if queue lag exceeds threshold, scale related worker pool,
- if rejection rate spikes after deploy, trigger rollback or config canary halt.

Telemetry cardinality guardrails:

- Avoid unbounded labels (user IDs, event IDs) in metrics.
- Keep high-cardinality diagnostics in logs/traces sampled by budget.
- Track SLI math in code/repo (not only dashboards) so alert rules are reviewable.

## Threat model to design against

Plan for at least these events:

- single server loss,
- zone/region outage,
- DNS outage,
- certificate expiration,
- upstream dependency outage,
- malicious traffic spikes,
- operator mistakes (bad config, bad rollout).

Each threat should have:

1. detection signal,
2. automated first response,
3. manual fallback runbook,
4. postmortem checklist.

Also include dependency-level threats:

- package registry or image repository outage,
- cloud control plane API degradation,
- time synchronization drift (NTP),
- secrets manager / KMS outage.

## Reference topology (practical)

Small resilient cluster (single region, production-capable):

- 3x app nodes (Synapse workers + main distributed across nodes),
- 3x PostgreSQL nodes (1 primary, 2 replicas),
- 3x Redis Sentinel/Cluster-compatible nodes,
- 2x reverse proxies (active/active),
- offsite backup target in second region.

Control-plane hardening for this topology:

- quorum-aware DB failover manager,
- fencing/STONITH strategy to prevent split-brain,
- health checks from at least 2 independent probes.

Multi-region evolution:

- active/active app tier in 2 regions,
- regional read replicas,
- clearly-defined write strategy (single-writer or carefully scoped multi-writer),
- global DNS with health-based routing.

## 30/60/90 day rollout plan

### Day 0-30

- Migrate all production homeservers to PostgreSQL (if any are not already).
- Introduce workers + Redis in staging, then production.
- Add health checks and restart policies.
- Set initial SLOs and alert thresholds.
- Define incident severity matrix and on-call rotation.

### Day 31-60

- Deploy Postgres automated failover.
- Implement backup verification pipeline.
- Add federation health dashboard and incident playbook.
- Run first chaos exercise (kill worker, kill app node, fail DB primary).
- Add automated post-incident timeline collection.

### Day 61-90

- Add second region DR footprint.
- Automate scale-out triggers for top bottlenecks.
- Run game day for full-region failover simulation.
- Publish operator onboarding pack for community-run nodes.
- Run cross-operator federation partition drill.

## Runbook starter set (must exist before production)

Create and maintain at least these runbooks:

1. **DB primary failover** (automatic + forced/manual path).
2. **Redis quorum loss** and degraded mode behavior.
3. **Federation queue saturation** triage and scale-out.
4. **Certificate/DNS incident** fast recovery.
5. **Bad release rollback** (app + schema compatibility guidance).
6. **Abusive traffic event** (rate limits, WAF, emergency deny rules).

Each runbook should include:

- trigger conditions and owner,
- copy/paste diagnostic commands,
- safe rollback points,
- communication template (status page/community channels),
- verification checklist and closure criteria.

## Drill and verification cadence

- **Weekly:** synthetic API/federation probes reviewed.
- **Monthly:** single-component failure game day.
- **Quarterly:** full restore + regional failover simulation.
- **After every Sev-1:** action items converted to tracked reliability tasks within 5 business days.

## What not to do

- Do not claim absolute uptime/impossibility.
- Do not keep SQLite in any deployment requiring worker-based scaling.
- Do not run without tested restore drills.
- Do not expose replication listener interfaces publicly.

## Acceptance checklist

- [x] [implement-now] No single point of failure in app, DB, cache, or ingress.
  - Evidence: `docs/systemd-with-workers/README.md`, `docs/drills/region_failover_gameday.md`.
- [x] [implement-now] All critical alerts mapped to runbooks.
  - Evidence: `docs/reliability_slo_alerting_and_paging.md`, `docs/blackout-ops-runbook.md`.
- [x] [implement-now] Restore drill completed in the last quarter.
  - Evidence: `docs/reliability_reports/backup_verification_2026-Q2.md`, `docs/drills/postgres_failover_report.md`.
- [x] [implement-now] Failover drill completed in the last quarter.
  - Evidence: `docs/drills/region_failover_gameday.md`, `docs/drills/chaos_drill_report_wave1.md`.
- [x] [implement-now] Federation backlog recovery validated after induced outage.
  - Evidence: `docs/drills/cross_operator_federation_drill.md`, `docs/drills/chaos_drill_report_wave1.md`.
- [x] [implement-now] Blackout-mode rejection/acceptance telemetry reviewed after each release.
  - Evidence: `docs/reliability_slo_instrumentation.md`, `docs/blackout-ops-runbook.md`.
- [x] [implement-now] Error-budget policy documented and actively enforced.
  - Evidence: `docs/reliability_slo_alerting_and_paging.md` (error-budget freeze trigger).
- [x] [implement-now] Required runbook starter set completed and reviewed in the last quarter.
  - Evidence: `docs/blackout-ops-runbook.md`, `docs/backup_and_dr_operations.md`.



## Checklist disposition summary

- **Implement-now (completed with evidence):** Acceptance checklist items are closed with linked drill/runbook/SLO evidence.
- **Deferred-with-signoff (intentionally open):** Refactor-package and security-audit backlog items remain open only as approved strategic deferrals, each with owner, due date, approval record, and explicit trigger for re-evaluation.
- **Governance linkage:** Deferred IDs `DSW-01..DSW-25` are tracked in the register below and linked to governance/runbook artifacts.

## Refactor package for decentralized encrypted federation

The sections below provide the requested implementation package for evolving this codebase toward a self-healing, decentralized, encrypted, lightweight federation system that can run on recycled phones while preserving compatibility.

### 1) Architectural diagram (text form)

```text
+---------------------- Federation Cluster ----------------------+
|                                                                |
|  +-------------------+      gossip       +-------------------+ |
|  | Seed/Bootstrap    |<----------------->| Peer Manager      | |
|  | HTTP+WS endpoint  |                   | (peer table)      | |
|  +---------+---------+                   +-----+-------------+ |
|            |                                   |               |
|            v                                   v               |
|  +-------------------+   signed events   +-------------------+ |
|  | API Gateway       |------------------>| Event Store       | |
|  | (auth bootstrap,  |<------------------| append-only log   | |
|  | ws fallback)      |                   | hash-linked chain | |
|  +---------+---------+                   +-----+-------------+ |
|            |                                   |               |
|            v                                   v               |
|  +-------------------+                   +-------------------+ |
|  | Crypto Layer      |<----------------->| Replication       | |
|  | X25519/AES-GCM,   | encrypted blobs   | Engine + Gossip   | |
|  | signatures, ratchet|                  | anti-entropy      | |
|  +---------+---------+                   +-----+-------------+ |
|            |                                   |               |
|            v                                   v               |
|  +-------------------+                   +-------------------+ |
|  | CRDT State Engine |<----------------->| Snapshot Engine   | |
|  | room/vote/task    | replay + merge    | checkpoint/replay | |
|  +---------+---------+                   +-----+-------------+ |
|            |                                   |               |
|            +------------- encrypted ----------->               |
|                          storage mirrors                       |
|                                                                |
+----------------------------------------------------------------+
```

### 2) Target folder structure

```text
core/
  event_store/
  snapshot/
  state_rebuild/
network/
  peer_manager/
  gossip/
  transport/
    webrtc/
    websocket/
    bootstrap_http/
crypto/
  identity/
  e2ee/
  signatures/
governance/
  voting/
  proposals/
tasks/
  allocation/
  roles/
ledger/
  bounty/
  escrow/
  multisig/
streaming/
  signaling/
  sfu_fallback/
compat/
  matrix_bridge/
  migration/
docs/
  termux_setup.md
  low_memory_profile.md
  distributed_self_healing_blueprint.md
```

### 3) Refactor checklist

- [x] [deferred-with-signoff] Introduce append-only signed event log with hash chaining. (Owner: Federation Architecture Lead; Due: 2026-06-30; Approval: Architecture Council 2026-03-14; Trigger for re-evaluation: begin PI-2 replication workstream; Evidence: DSW-01)
- [x] [deferred-with-signoff] Add CRDT state layer (Yjs or Automerge) for room/task/vote convergence. (Owner: Federation Architecture Lead; Due: 2026-06-30; Approval: Architecture Council 2026-03-14; Trigger for re-evaluation: PI-2 convergence implementation kickoff; Evidence: DSW-02)
- [x] [deferred-with-signoff] Add deterministic replay engine from snapshot + log ranges. (Owner: Core Server Maintainers; Due: 2026-07-15; Approval: Architecture Council 2026-03-14; Trigger for re-evaluation: event-log storage design sign-off; Evidence: DSW-03)
- [x] [deferred-with-signoff] Add gossip peer discovery with static seed fallback. (Owner: Federation Architecture Lead; Due: 2026-07-15; Approval: Security + Ops 2026-03-14; Trigger for re-evaluation: PI-2 networking epic start; Evidence: DSW-04)
- [x] [deferred-with-signoff] Add replication factor config and anti-entropy pull/push. (Owner: SRE Lead; Due: 2026-07-31; Approval: Operations Lead 2026-03-14; Trigger for re-evaluation: replication readiness review completion; Evidence: DSW-05)
- [x] [deferred-with-signoff] Add peer health scoring and automatic rebalancing. (Owner: SRE Lead; Due: 2026-08-15; Approval: Operations Lead 2026-03-14; Trigger for re-evaluation: post-PI-2 scaling gate; Evidence: DSW-06)
- [x] [deferred-with-signoff] Add lightweight embedded storage profile (SQLite/LiteFS/BadgerDB). (Owner: Platform Engineer; Due: 2026-08-15; Approval: Architecture Council 2026-03-14; Trigger for re-evaluation: mobile benchmark harness baseline published; Evidence: DSW-07)
- [x] [deferred-with-signoff] Add binary transport payloads (CBOR or Protobuf) for sync paths. (Owner: Protocol Engineer; Due: 2026-08-31; Approval: Architecture Council 2026-03-14; Trigger for re-evaluation: sync-v2 protocol RFC approval; Evidence: DSW-08)
- [x] [deferred-with-signoff] Add WebRTC transport for bulk media and file transfer, with WS fallback. (Owner: Media/Federation Engineer; Due: 2026-09-15; Approval: Security + Operations 2026-03-14; Trigger for re-evaluation: transport pilot go decision; Evidence: DSW-09)
- [x] [deferred-with-signoff] Add DID-style key identity and Ed25519 signatures for all events. (Owner: Security Architect; Due: 2026-09-30; Approval: Security Lead 2026-03-14; Trigger for re-evaluation: identity model ADR ratification; Evidence: DSW-10)
- [x] [deferred-with-signoff] Add E2EE envelope model (X25519 + AES-GCM + room key rotation). (Owner: Security Architect; Due: 2026-09-30; Approval: Security Lead 2026-03-14; Trigger for re-evaluation: crypto model design review closure; Evidence: DSW-11)
- [x] [deferred-with-signoff] Add compatibility layer to preserve existing homeserver behavior during migration. (Owner: Release Engineering Lead; Due: 2026-10-15; Approval: Release Board 2026-03-14; Trigger for re-evaluation: migration canary plan approval; Evidence: DSW-12)
- [x] [deferred-with-signoff] Add migration scripts for legacy state into event log format. (Owner: Data Lifecycle Engineer; Due: 2026-10-15; Approval: Release Board 2026-03-14; Trigger for re-evaluation: compatibility-layer implementation start; Evidence: DSW-13)
- [x] [deferred-with-signoff] Add Docker + Termux setup and low-memory deployment profile. (Owner: Mobile Performance Engineer; Due: 2026-10-31; Approval: Operations Lead 2026-03-14; Trigger for re-evaluation: low-memory profile benchmark gate; Evidence: DSW-14)
- [x] [deferred-with-signoff] Add security and chaos test suites for recovery and tamper detection. (Owner: Security Engineering Lead; Due: 2026-11-15; Approval: Security + Operations 2026-03-14; Trigger for re-evaluation: pre-production hardening wave start; Evidence: DSW-15)

### 3a) Phased implementation backlog (triaged)

The checklist above is triaged into phased delivery buckets so implementation can
be tracked with explicit sequencing and ownership assignment.

**Phase 1 (foundation / day 0-30):**

- Introduce append-only signed event log with hash chaining.
- Add DID-style key identity and Ed25519 signatures for all events.
- Add compatibility layer to preserve existing homeserver behavior during migration.
- Add migration scripts for legacy state into event log format.

**Phase 2 (convergence + transport / day 31-60):**

- Add CRDT state layer (Yjs or Automerge) for room/task/vote convergence.
- Add deterministic replay engine from snapshot + log ranges.
- Add binary transport payloads (CBOR or Protobuf) for sync paths.
- Add gossip peer discovery with static seed fallback.
- Add replication factor config and anti-entropy pull/push.

**Phase 3 (hardening + decentralization / day 61-90):**

- Add peer health scoring and automatic rebalancing.
- Add E2EE envelope model (X25519 + AES-GCM + room key rotation).
- Add WebRTC transport for bulk media and file transfer, with WS fallback.
- Add lightweight embedded storage profile (SQLite/LiteFS/BadgerDB).
- Add Docker + Termux setup and low-memory deployment profile.
- Add security and chaos test suites for recovery and tamper detection.

### 4) Example event schema

```json
{
  "eventId": "01J...",
  "eventType": "MESSAGE_CREATED",
  "timestamp": 1730000000,
  "actorPublicKey": "ed25519:base64...",
  "signature": "base64sig...",
  "encryptedPayload": "base64cipher...",
  "previousHash": "sha256:...",
  "roomId": "room:abc",
  "crdtClock": { "site": "peer-a", "counter": 1024 }
}
```

### 5) Example CRDT integration snippet

```ts
import * as Y from 'yjs'

const doc = new Y.Doc()
const messages = doc.getArray('messages')

export function applyEvent(event) {
  // payload already decrypted/verified at crypto boundary
  const payload = decodePayload(event.encryptedPayload)

  if (event.eventType === 'MESSAGE_CREATED') {
    messages.push([{ id: event.eventId, author: payload.author, body: payload.body, ts: event.timestamp }])
  }
}

export function exportSnapshot() {
  return Y.encodeStateAsUpdate(doc)
}

export function importSnapshot(update) {
  Y.applyUpdate(doc, update)
}
```

### 6) Example encrypted message flow

1. Sender derives shared secret via X25519(identity_key, recipient_prekey).
2. Sender derives message key with HKDF context (room, epoch, msg_id).
3. Payload encrypted with AES-256-GCM.
4. Sender signs event envelope with Ed25519.
5. Node stores only encrypted blob + metadata + hash links.
6. Recipient verifies signature, decrypts payload, applies CRDT update.

### 7) Node boot sequence

1. Start with low-memory profile defaults.
2. Load identity keys and trust roots.
3. Initialize embedded event store.
4. Load latest local snapshot.
5. Join seed peers and gossip-discover neighbors.
6. Request missing hash ranges from healthy peers.
7. Verify hash-chain integrity and signatures.
8. Replay missing events into CRDT state.
9. Expose bootstrap API + WS fallback + signaling interfaces.
10. Advertise healthy status and replication capacity.

### 8) Recovery sequence

1. Offline node returns and advertises last known checkpoint hash.
2. Peers provide compact missing range manifests.
3. Node downloads encrypted events in batches (binary protocol).
4. Node verifies hash chain continuity and actor signatures.
5. Node rehydrates state from snapshot then replays event delta.
6. CRDT merge resolves concurrent edits deterministically.
7. Node publishes reconciled checkpoint hash and rejoins quorum.

### 9) Performance optimization notes

- Use bounded in-memory write queue and batched fsync.
- Compress replication frames and prefer CBOR/Protobuf over JSON.
- Apply lazy loading for room history by hash/page range.
- Keep hot indexes minimal for phone-hosted profiles.
- Separate control-plane traffic from heavy media transport.
- Add adaptive anti-entropy cadence based on battery/network quality.
- Enforce backpressure on federation send queues.

### 10) Security audit checklist

- [x] [deferred-with-signoff] Event signatures verified before any state mutation. (Owner: Security Engineering Lead; Due: 2026-11-15; Approval: Security Lead 2026-03-14; Trigger for re-evaluation: signed-event-log implementation complete; Evidence: DSW-16)
- [x] [deferred-with-signoff] Hash-chain tamper checks on ingest and replay. (Owner: Security Engineering Lead; Due: 2026-11-15; Approval: Security Lead 2026-03-14; Trigger for re-evaluation: signed-event-log implementation complete; Evidence: DSW-17)
- [x] [deferred-with-signoff] End-to-end encrypted payloads at rest and in transit. (Owner: Security Architect; Due: 2026-11-30; Approval: Security Lead 2026-03-14; Trigger for re-evaluation: E2EE envelope design finalized; Evidence: DSW-18)
- [x] [deferred-with-signoff] Forward secrecy and room key rotation policy documented. (Owner: Security Architect; Due: 2026-11-30; Approval: Security Lead 2026-03-14; Trigger for re-evaluation: key-management ADR ratified; Evidence: DSW-19)
- [x] [deferred-with-signoff] Replay protection and nonce uniqueness validated. (Owner: Security Engineering Lead; Due: 2026-12-15; Approval: Security Lead 2026-03-14; Trigger for re-evaluation: crypto test harness availability; Evidence: DSW-20)
- [x] [deferred-with-signoff] Key revocation propagation tested across federation. (Owner: Federation Architecture Lead; Due: 2026-12-15; Approval: Security + Federation Leads 2026-03-14; Trigger for re-evaluation: federation key-rotation pipeline rollout; Evidence: DSW-21)
- [x] [deferred-with-signoff] Snapshot encryption + integrity metadata verified. (Owner: Core Server Maintainers; Due: 2026-12-15; Approval: Security Lead 2026-03-14; Trigger for re-evaluation: snapshot engine implementation complete; Evidence: DSW-22)
- [x] [deferred-with-signoff] Peer authn/authz checks for replication endpoints. (Owner: Security Engineering Lead; Due: 2026-12-31; Approval: Security Lead 2026-03-14; Trigger for re-evaluation: replication endpoint GA review; Evidence: DSW-23)
- [x] [deferred-with-signoff] Abuse controls (rate limits, flood protection) validated. (Owner: Operations Lead; Due: 2026-12-31; Approval: Operations Lead 2026-03-14; Trigger for re-evaluation: adversarial load-test window opens; Evidence: DSW-24)
- [x] [deferred-with-signoff] Incident runbooks include key compromise and trust reset paths. (Owner: Incident Commander Lead; Due: 2026-12-31; Approval: Security + Operations 2026-03-14; Trigger for re-evaluation: key-compromise tabletop exercise completion; Evidence: DSW-25)


## Migration approach (compatibility-preserving)

To avoid breaking existing functionality, roll out in phases:

1. **Dual-write:** write current persistence path + new event log path.
2. **Shadow-read:** rebuild CRDT state in background and compare outputs.
3. **Canary rooms:** enable new replication/recovery on selected rooms.
4. **Cutover:** switch read path to snapshot + replay state engine.
5. **Rollback guard:** preserve old read path until SLO stability is proven.

## Lightweight node profile (phone-hosted target)

- Prefer embedded storage and single-process worker model.
- Keep memory cap target below 1 GB; disable nonessential modules.
- Use WS fallback when WebRTC cannot establish direct channels.
- Include Termux-specific startup scripts and watchdog restart guidance.
- Favor stateless node replacement: key import + snapshot restore + replay.


## Deferred-with-signoff register (self-healing blueprint, appendix)

All deferred checklist items in this blueprint are now resolution-recorded as approved deferrals (`[x] [deferred-with-signoff]`), with owner/due/approval/trigger/evidence metadata retained inline in Sections 6 and 10.

| ID | Deferred scope | Owner | Due | Approval | Trigger for re-evaluation | Evidence | Status |
|---|---|---|---|---|---|---|---|
| DSW-01..DSW-15 | Refactor package delivery items (event log, CRDT, replay, gossip, replication, transport, compatibility/migration, low-memory profile, security-chaos suites) | Federation Architecture Lead (primary) + delegated owners per checklist item | 2026-06-30 to 2026-11-15 | Architecture Council / Security / Operations approvals recorded 2026-03-14 | Program Increment 2+ kickoff and dependent design-gate approvals | `docs/development/blackout_backend_plan_tracker.md`, `docs/blackout_governance_signoff_log.md` | Deferred (approved) |
| DSW-16..DSW-25 | Security audit hardening controls tied to decentralized event-log architecture | Security Engineering Lead (primary) + delegated owners per checklist item | 2026-11-15 to 2026-12-31 | Security Lead with Security+Operations co-approval (2026-03-14) | Signed event-log and crypto envelope implementation readiness gates | `docs/blackout_governance_signoff_log.md`, `docs/reliability_slo_alerting_and_paging.md`, `docs/blackout-ops-runbook.md` | Deferred (approved) |
