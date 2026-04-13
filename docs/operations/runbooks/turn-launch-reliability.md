# TURN-backed Call Reliability Launch Runbook

## Scope
This runbook defines launch-day hardening, validation, and response steps for TURN-backed Matrix calls (1:1 and group) using Synapse + coturn.

## 1) coturn configuration checklist (secure defaults)

Use `infra/single-server-baseline/coturn/turnserver.conf.template` as the launch baseline and confirm each item below before go-live.

### Identity and auth
- [ ] `realm` and `server-name` are set to the production TURN FQDN.
- [ ] `use-auth-secret` is enabled.
- [ ] `static-auth-secret` is populated from secret manager, minimum 32 random bytes.
- [ ] Secret parity check completed: coturn `static-auth-secret` equals Synapse `turn_shared_secret`.

### Transport and TLS
- [ ] TURN over UDP/TCP listener enabled on `3478`.
- [ ] TURN over TLS listener enabled on `5349`.
- [ ] TLS cert and key paths are present and readable at runtime.
- [ ] TLS weak protocols disabled (`no-tlsv1`, `no-tlsv1_1`).
- [ ] TLS cipher policy set (`cipher-list`).
- [ ] Diffie-Hellman params file configured (`dh-file`).

### Abuse resistance and operational controls
- [ ] `no-cli` is enabled.
- [ ] `stale-nonce=600` is set.
- [ ] `no-multicast-peers` and `no-loopback-peers` are enabled.
- [ ] Relay port range is pinned (`min-port=49160`, `max-port=49200`) and firewall rules match.
- [ ] Internal/private destination ranges are blocked via `denied-peer-ip`.
- [ ] Global allocation guardrails are configured (`total-quota`).

### Observability and health
- [ ] `prometheus` endpoint enabled and scraped.
- [ ] TURN health probe path wired through edge proxy (if used).
- [ ] Alerts configured for allocation failures, auth failures, and listener downtime.

## 2) Synapse TURN binding checklist

Validate the active homeserver config is consistent with TURN runtime:

- [ ] `turn_uris` includes UDP `3478`, TCP `3478`, and TLS `5349` endpoints for the same TURN host.
- [ ] `turn_shared_secret` is identical to coturn `static-auth-secret`.
- [ ] `turn_user_lifetime` is set (launch baseline: `1h`).
- [ ] `turn_allow_guests: false` for launch abuse posture.
- [ ] `/_matrix/client/v3/voip/turnServer` returns valid credentials and URI list for authenticated users.

## 3) Firewall and port matrix

| Flow | Source | Destination | Proto/Port | Required | Notes |
|---|---|---|---|---|---|
| Client TURN (UDP) | Internet clients | coturn | UDP/3478 | Yes | Primary low-latency relay path. |
| Client TURN (TCP) | Internet clients | coturn | TCP/3478 | Yes | Fallback when UDP blocked. |
| Client TURNS (TLS) | Internet clients | coturn | TCP/5349 | Yes | Enterprise/firewall-constrained path. |
| TURN Relay media | coturn | Internet clients | UDP/49160-49200 | Yes | Must match coturn `min-port`/`max-port`. |
| Synapse -> TURN creds | clients | Synapse | HTTPS/443 | Yes | `voip/turnServer` credential fetch. |
| Metrics scrape | monitoring | coturn | TCP/9641 | Optional | Restrict to internal monitoring CIDRs. |

## 4) Call test matrix (launch validation)

Run this matrix in staging and again in production validation window.

| ID | Scenario | Preconditions | Expected result | Failure signal |
|---|---|---|---|---|
| CALL-1 | 1:1 call over normal network | Two users, separate networks, TURN reachable | Audio/video connect < 10s; stable for 5m | Setup timeout, one-way media, reconnect loops |
| CALL-2 | 1:1 with forced TURN/TCP | Block UDP/3478 between client and TURN | Call still connects via TCP/3478 | Call fails until UDP restored |
| CALL-3 | 1:1 with forced TURNS | Block UDP/3478 and TCP/3478; allow TCP/5349 | Call connects via TLS relay | No media path under constrained network |
| CALL-4 | Group call (4 participants) | Mixed NAT/client networks | All participants join < 20s, no systematic packet loss | Join failures correlated by network type |
| CALL-5 | Group call (8 participants) | Same as CALL-4 + load baseline | Acceptable bitrate adaptation; no mass disconnects | Cascading disconnect or SFU congestion |
| CALL-6 | TURN unavailable degraded mode | Stop coturn or block 3478/5349 | UI warning shown; fallback path remains available per policy | Silent failure with no user guidance |

### Execution notes
- Capture per-test evidence: timestamp, participants, network constraints, and screenshots/log snippets.
- Re-run CALL-1 and CALL-4 after any TURN or Synapse secret rotation.

## 5) Degraded-mode behavior when TURN is unavailable

When TURN is down or unreachable:

1. Keep signaling and room UX functional.
2. Surface explicit non-blocking call degradation warning in client.
3. Preserve fallback call mode if configured (widget/PSTN alternative).
4. Avoid infinite retry loops; use bounded retries with backoff.
5. Publish operator status update with ETA and workaround.

## 6) Incident response quick-actions

### First 5 minutes
1. Confirm impact via synthetic checks and fresh user reports.
2. Query TURN credential endpoint: `/_matrix/client/v3/voip/turnServer` with an authenticated token.
3. Verify coturn process/listeners (`3478`, `5349`, relay range).
4. Validate TLS cert validity for TURN hostname.
5. Check auth-secret parity between Synapse and coturn.

### 5-15 minutes
1. If secret mismatch suspected, rotate/reload both sides in a coordinated change.
2. If port/path blocked, apply firewall hotfix for `3478/udp`, `3478/tcp`, `5349/tcp`, and relay UDP range.
3. If TLS failure, swap to known-good cert chain and reload coturn.
4. If unresolved, declare degraded mode and post user-facing workaround.

### Recovery criteria
- TURN allocation success restored.
- 1:1 and group validation smoke tests pass (CALL-1 + CALL-4 minimum).
- No new critical call alerts for 30 consecutive minutes.

