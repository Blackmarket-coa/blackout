# Blackout Ops Runbook

This runbook covers operating Synapse in Blackout signaling-only mode.

Related reliability and refactor tracking docs:

- [Distributed self-healing blueprint](./distributed_self_healing_blueprint.md)
- [Project completion tracker](./project_completion_tracker.md)
- [Backup and DR operations](./backup_and_dr_operations.md)

## Enable blackout mode

1. Set the following in homeserver config:

```yaml
blackout_signaling_only_mode: true   # migration alias for blackout.enabled
blackout:
  enabled: true
  signal_event_ttl: "48h"
```

2. Restart Synapse.
3. Confirm startup logs include blackout overrides for search/media settings.

## Validation checklist

- Create a `m.blackout.signal` event and verify it is accepted.
- Attempt to send `m.room.message` and verify rejection.
- Confirm counters increment:
  - `synapse_blackout_signal_events_accepted_total`
  - `synapse_blackout_event_rejections_total`
  - `synapse_blackout_signal_revoked_key_rejections_total`
  - `synapse_blackout_federation_signal_revoked_key_rejections_total`

## Federation checks

- Confirm valid federated `m.blackout.signal` PDUs are accepted.
- Confirm unsupported federated timeline types are rejected and counted in
  `synapse_blackout_federation_event_rejections_total`.

## Incident triage

### High `unsupported_timeline_type` rejections

Likely cause: non-blackout client behavior.

Actions:
- Verify client-side event type usage.
- Verify room traffic is using `m.blackout.signal` payloads.

### High `invalid_signal_content` rejections

Likely cause: protocol mismatch or malformed payload.

Actions:
- Compare payload keys with allowlist (`ice_candidates`, `sdp_offer`,
  `sdp_answer`, `message_metadata`, `chunk_announcements`).
- Check upstream peers for outdated schema.

### Redundancy mismatch / withholding suspicion

Likely cause: announced chunk replication factor is not reflected in observed
replica hints, relay under-replication, or intentional withholding.

Actions:
- Inspect `synapse_blackout_signal_redundancy_mismatch_total` and
  `synapse_blackout_federation_signal_redundancy_mismatch_total` for sustained growth.
- Alert when mismatch count is non-zero for 2 consecutive windows; escalate if
  sustained for >=30m.
- Compare declared replication-factor distribution from
  `*_declared_replication_factor_total` with room topology/relay capacity.
- Reassign temporary relays and verify `message_metadata.topology_hints` are
  updated across active senders.

### High revoked-device-key rejections

Likely cause: compromised device, stale sender metadata, or malicious replay.

Actions:
- Inspect `synapse_blackout_signal_revoked_key_rejections_total` and
  `synapse_blackout_federation_signal_revoked_key_rejections_total` trend lines.
- Correlate rejected user IDs/device IDs with recent logout/device-delete activity.
- If rejections are unexpected, rotate active device keys and invalidate sessions.

## Retention policy for `e2e_device_key_revocations`

Policy decision: **immutable revocation history by default**.

Rationale:
- Revocations are security-critical denylist signals.
- Re-accepting previously revoked key identifiers after TTL can re-open compromise windows.

Operational guidance:
- Keep rows indefinitely unless there is a legal/data-retention requirement forcing expiry.
- If expiry is required, use a long minimum (>= 180 days) and pair with client key rotation
  policy + audit logging.
- During DB maintenance, never bulk-delete recent revocations without incident review.

## Rollback

1. Set `blackout.enabled: false`.
2. Restart Synapse.
3. Re-enable search/media settings if required for the deployment.


## Phone-hosted low-resource profile

Recommended baseline for constrained/mobile-hosted homeservers:

- `blackout.enabled: true`
- `blackout.signal_event_ttl: "48h"`
- `enable_search: false` and `enable_media_repo: false` (forced under blackout)
- `blackout.skip_push_actions_for_signal: true`
- `use_presence: false`
- `cleanup_extremities_with_dummy_events: false`
- `dummy_events_threshold: 20`
- Keep worker/background topology conservative; avoid optional heavy workers.

Example profile snippet:

```yaml
blackout:
  enabled: true
  signal_event_ttl: "48h"
  skip_push_actions_for_signal: true

enable_search: false
enable_media_repo: false

use_presence: false
cleanup_extremities_with_dummy_events: false
dummy_events_threshold: 20
```

Capacity baseline and caveats:

- Target ~200–500 registered users and ~20–50 concurrently active peers.
- Expect battery, thermal, and network churn; plan automated restart/health checks.
- Monitor WAL/database growth and run regular backups with restore drills.
- Treat phone-hosted nodes as best-effort edges; keep one stable always-on peer for continuity.

Reliability caveats (phone hosting):

- **Battery/network churn:** mobile radios and OS background limits can interrupt long-lived federation and relay flows.
- **WAL growth:** SQLite WAL can grow quickly during unstable connectivity and retry bursts; monitor and checkpoint during maintenance windows.
- **Backup cadence:** use frequent incremental backups (for example every 4-6h) plus daily verified restore checks.

## Scalability thresholds and relay policy

Suggested operating guardrails for blackout mesh signaling:

- Room fan-out target: 20–50 active peers; introduce temporary relays above 50.
- Room fan-out warning band: 51–75 active peers (move to staged relay assignments).
- Room fan-out critical: >75 active peers (enforce hierarchical mesh / super-peer routing).
- Warning threshold: federation blackout reject rate >1% over 15m.
- Critical threshold: federation blackout reject rate >5% over 15m.
- Warning threshold: signal purge lag >15m.
- Critical threshold: signal purge lag >60m.

Temporary relay/super-peer selection guidance:

- Prefer stable, always-on nodes with low packet loss and sufficient uplink.
- Publish relay topology hints in `message_metadata.topology_hints`.
- Roll back relay assignment if reject rates or ICE failures increase for 2 consecutive windows.

Room policy template for temporary relay assignment:

1. Elect 2-3 temporary relays from peers with best uptime, battery/power stability,
   and observed packet-loss profile.
2. Publish relay IDs in `message_metadata.topology_hints` for all room members.
3. Keep relay assignment until fan-out and reject metrics stay below warning thresholds
   for at least two consecutive 15m windows.
4. Demote relays gradually (one relay per window) to avoid topology oscillation.

Topology hints payload example:

```json
{
  "message_metadata": {
    "message_id": "<opaque-id>",
    "sender_key_id": "ed25519:<device-id>",
    "topology_hints": ["relay:peer-a", "relay:peer-b"]
  }
}
```

### Triage playbook for rising federation rejection rates

Use this flow before broad rollback whenever rejection-rate alerts fire:

1. **Confirm scope and threshold window**
   - Validate whether the alert is warning (`>1%/15m`) or critical (`>5%/15m`).
   - Check if impact is global or isolated to a small set of destination domains.
2. **Classify rejection cause from logs/metrics**
   - Payload validation failures (`invalid blackout signal payload`) usually indicate
     incompatible sender implementations.
   - Unsupported event-type rejections indicate non-signaling traffic still being
     attempted during blackout.
   - Revoked-device-key rejections indicate stale/compromised sender credentials.
3. **Apply targeted mitigation first**
   - For isolated domains: contact remote operators and temporarily bias traffic via
     stable relay nodes.
   - For payload-shape drift: pin or roll forward compatible client builds and
     communicate schema requirements.
   - For key-revocation spikes: force key refresh / device re-verification workflows.
4. **Re-check after two 15m windows**
   - If rejection rate returns below warning threshold and ICE success remains stable,
     keep blackout posture unchanged.
   - If still above warning threshold, keep mitigations and open an incident ticket.
   - If still above critical threshold, initiate controlled rollback preparation.
5. **Rollback guardrails (last resort)**
   - Roll back one control at a time (relay policy before disabling blackout mode).
   - Announce rollback blast radius and expected safety trade-offs.
   - Capture post-change metrics snapshot for postmortem and policy tuning.


## Backup and disaster-recovery execution

For concrete E1-E4 implementation details (backup schedule, verification pipeline,
quarterly drill command, and alert rules), follow
[`docs/backup_and_dr_operations.md`](./backup_and_dr_operations.md).


## Wave-1 infra/TURN baseline (2026-03-25 bucket)

### Secure coturn baseline

Use an external coturn sidecar/service with the following minimum controls:

- Long-term credentials enabled (`lt-cred-mech`) with rotating shared secret.
- TLS enabled for TURN-over-TLS endpoints.
- Explicit relay IP configuration (`external-ip`) on NATed hosts.
- Allowed peer ACLs restricted to required ranges only.
- Verbose audit logging enabled and shipped to central log pipeline.

### Dependency health checks

- coturn process liveness (`systemctl status coturn` or container healthcheck).
- TURN allocate/success probe from staging client.
- DNS + certificate expiry checks for TURN hostname.

### Metrics contract

Track these per 5m and 15m windows:

- setup success rate (offer/answer completion)
- ICE candidate failure rate
- relay fallback rate

### Abuse-control defaults for signaling storms

- Rate-limit repeated signaling attempts per sender/device pair.
- Cap concurrent active signaling sessions per room.
- Trigger temporary backoff when per-room rejection spikes exceed alert thresholds.
- Escalate to incident workflow if sustained storm behavior exceeds two windows.
