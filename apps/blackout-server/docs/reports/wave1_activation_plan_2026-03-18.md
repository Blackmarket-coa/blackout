# Wave-1 activation plan (2026-03-18)

This artifact freezes the Wave-1 scope buckets and converts near-due deferred items into explicit sprint tickets with DRI and implementation PR linkage.

## 1) Frozen scope and activation status

- Wave-1 frozen bucket (`2026-03-22`): **20 activated tickets**.
- Protocol bucket (`2026-03-24`): **14 activated tickets**.
- Infra/TURN bucket (`2026-03-25`): **9 activated tickets**.
- Retention bucket (`2026-03-26`): **9 activated tickets**.
- Activation PR requirement: each activated ticket includes `implementation_pr` metadata in tracker rows.

## 2) Daily burn-down target (`2026-03-22` bucket)

- Target: **4 tickets/day** until all 20 due-`2026-03-22` tickets are completed.
- Governance checkpoint: end-of-day review against ticket status + evidence links.

## 3) Acceptance-test lock (storage/persistence policy tasks)

- Locked suites:
  - `blackout_runtime_tests/test_policy_engine.py`
  - `tests/handlers/test_message.py`
  - `tests/handlers/test_federation_event.py`
  - `tests/storage/databases/main/test_end_to_end_keys.py`

## 4) Canonical persisted/non-persisted data matrix

| Surface | Persistence policy | Contract |
|---|---|---|
| Accounts/profile metadata | Persisted | Required for authentication and account lifecycle. |
| Device keys/cross-signing | Persisted | Required for identity/security primitives. |
| Membership/auth-critical state | Persisted | Required for auth/state resolution. |
| `m.blackout.signal` metadata | Persisted (TTL-bounded) | Retained only in configured signaling retention window. |
| `m.room.message` | Not persisted | Blocked in blackout signaling-only mode. |
| `m.room.encrypted` | Not persisted | Blocked in blackout signaling-only mode. |
| Media binaries/derivatives | Not persisted | Disabled in blackout signaling-only mode. |
| Search indexes over payloads | Not persisted | Disabled in blackout signaling-only mode. |

## 5) Migration-safe rollout note for persistence toggles

1. Enable `blackout_signaling_only_mode` in staging first.
2. Validate lock-suite acceptance tests and API behavior for blocked payload events.
3. Enforce one-way transition for production cutover windows (no mixed search/media toggles).
4. Attach per-step evidence in deployment go/no-go checklist before production enablement.

## 6) `m.blackout.signal` schema + validator/error contract

- Baseline constraints and optional sections are documented in `docs/signaling_only_persistence_policy.md`.
- Local creation path: blocked payload types return `403 / M_FORBIDDEN`; invalid signal payloads return `400 / M_BAD_JSON`.
- Federation ingress path: blocked payload types return federation 403; invalid signal payloads return federation 400.
- Client fallback contract for blocked timelines is documented in `docs/development/blackout_client_compatibility_matrix.md`.

## 7) Staging smoke gates per bucket closure

- Required smoke set per bucket:
  - Homeserver startup + `/_matrix/client/versions` health check
  - Federation ingress sanity (`m.blackout.signal` accept + blocked payload reject)
  - Worker health/liveness checks
- Environment status in this runner: **blocked** for live staging execution due missing staging credentials/endpoints; commands and expected evidence are listed in `docs/reports/readiness_next_25_steps_2026-03-17.md`.

## 8) Activated ticket registry

### Wave-1 storage/persistence bucket (2026-03-22)

| Ticket | DRI | Owner | Work item | Implementation PR |
|---|---|---|---|---|
| `W1-22-01` | `BE-DRI-01` | Backend Lead | Define canonical policy doc for what *is* persisted: | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-22-02` | `BE-DRI-02` | Backend Lead | User accounts | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-22-03` | `BE-DRI-03` | Backend Lead | Device keys / cross-signing state | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-22-04` | `BE-DRI-04` | Backend Lead | Room membership and auth-critical state | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-22-05` | `BE-DRI-05` | Backend Lead | Signaling events (ephemeral retention window) | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-22-06` | `BE-DRI-06` | Backend Lead | Define what is *not* persisted: | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-22-07` | `BE-DRI-07` | Backend Lead | `m.room.message` bodies | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-22-08` | `BE-DRI-08` | Backend Lead | `m.room.encrypted` payloads | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-22-09` | `BE-DRI-09` | Backend Lead | Media binaries | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-22-10` | `BE-DRI-10` | Backend Lead | Search indexes | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-22-11` | `BE-DRI-11` | Backend Lead | Add event-persistence gate in write path to reject/discard non-allowed content types. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-22-12` | `BE-DRI-12` | Backend Lead | Ensure auth/state resolution remains intact when payload events are not persisted. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-22-13` | `BE-DRI-13` | Backend Lead | Add config toggle for migration period: | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-22-14` | `BE-DRI-14` | Backend Lead | `blackout_signaling_only_mode: true|false` | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-22-15` | `BE-DRI-15` | Backend Lead | Disable media repository endpoints and background jobs. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-22-16` | `BE-DRI-16` | Backend Lead | Disable event indexing/search paths. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-22-17` | `BE-DRI-17` | Backend Lead | Remove/disable message history retrieval surfaces for blocked event classes. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-22-18` | `BE-DRI-18` | Backend Lead | Integration test: account + membership flows still pass. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-22-19` | `BE-DRI-19` | Backend Lead | Integration test: message events are rejected or dropped per policy. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-22-20` | `BE-DRI-20` | Backend Lead | Migration test: existing deployments can enable mode without DB corruption. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |

### Protocol bucket (2026-03-24)

| Ticket | DRI | Owner | Work item | Implementation PR |
|---|---|---|---|---|
| `W1-24-01` | `PE-DRI-01` | Protocol Engineer | Define event schema/versioning for `m.blackout.signal`. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-24-02` | `PE-DRI-02` | Protocol Engineer | Allowed content classes: | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-24-03` | `PE-DRI-03` | Protocol Engineer | ICE candidates | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-24-04` | `PE-DRI-04` | Protocol Engineer | SDP offers/answers | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-24-05` | `PE-DRI-05` | Protocol Engineer | Message metadata descriptors | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-24-06` | `PE-DRI-06` | Protocol Engineer | Chunk announcements | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-24-07` | `PE-DRI-07` | Protocol Engineer | Define max payload size and validation rules. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-24-08` | `PE-DRI-08` | Protocol Engineer | Add server-side validator for `m.blackout.signal` content. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-24-09` | `PE-DRI-09` | Protocol Engineer | Hard-block storage of: | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-24-10` | `PE-DRI-10` | Protocol Engineer | `m.room.message` | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-24-11` | `PE-DRI-11` | Protocol Engineer | `m.room.encrypted` | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-24-12` | `PE-DRI-12` | Protocol Engineer | Emit explicit error codes for blocked event types. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-24-13` | `PE-DRI-13` | Protocol Engineer | Document expected client behavior/fallback. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-24-14` | `PE-DRI-14` | Protocol Engineer | Add conformance tests for accepted and rejected payloads. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |

### Infra/TURN bucket (2026-03-25)

| Ticket | DRI | Owner | Work item | Implementation PR |
|---|---|---|---|---|
| `W1-25-01` | `IN-DRI-01` | Infra Lead | Decide primary model: | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-25-02` | `IN-DRI-02` | Infra Lead | Embedded phone-host STUN/TURN | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-25-03` | `IN-DRI-03` | Infra Lead | External `coturn` sidecar/recommended default | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-25-04` | `IN-DRI-04` | Infra Lead | Publish minimal secure `coturn` baseline config. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-25-05` | `IN-DRI-05` | Infra Lead | Server assists NAT traversal coordination only. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-25-06` | `IN-DRI-06` | Infra Lead | Server does not relay payload by default. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-25-07` | `IN-DRI-07` | Infra Lead | Add rate limits/abuse controls for signaling storms. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-25-08` | `IN-DRI-08` | Infra Lead | Add health checks for TURN/STUN dependency. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-25-09` | `IN-DRI-09` | Infra Lead | Add metrics: setup success, candidate failure rates, relay fallback ratio. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |

### Retention bucket (2026-03-26)

| Ticket | DRI | Owner | Work item | Implementation PR |
|---|---|---|---|---|
| `W1-26-01` | `DL-DRI-01` | Data Lifecycle Engineer | Add config: | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-26-02` | `DL-DRI-02` | Data Lifecycle Engineer | `blackout_signal_ttl_hours` (24–72) | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-26-03` | `DL-DRI-03` | Data Lifecycle Engineer | `blackout_purge_interval_minutes` | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-26-04` | `DL-DRI-04` | Data Lifecycle Engineer | Define TTL semantics (based on event creation vs. receipt time). | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-26-05` | `DL-DRI-05` | Data Lifecycle Engineer | Background purge job for expired signaling events. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-26-06` | `DL-DRI-06` | Data Lifecycle Engineer | Ensure purge is incremental and bounded. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-26-07` | `DL-DRI-07` | Data Lifecycle Engineer | Ensure purged content is irretrievable via APIs. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-26-08` | `DL-DRI-08` | Data Lifecycle Engineer | Retention tests (unit + integration). | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |
| `W1-26-09` | `DL-DRI-09` | Data Lifecycle Engineer | Verify purge does not remove auth-critical room state. | https://github.com/Blackmarket-coa/Blackout_server/pull/134 |

