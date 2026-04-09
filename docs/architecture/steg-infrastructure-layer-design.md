# Steganography Infrastructure Layer Design

## 1) Scope

This document defines the **infrastructure layer** for Blackout steganography with four required capabilities:

1. Open indicator protocol.
2. Group password derivation and storage.
3. Key rotation policy.
4. Compromised-key recovery.

It also explicitly splits responsibilities between backend and client.

---

## 2) Goals and non-goals

### Goals
- Make stego state explicit and interoperable across clients through a versioned protocol.
- Avoid storing raw shared passphrases on the backend.
- Enforce deterministic, auditable rotation with graceful migration windows.
- Contain blast radius when a stego key is suspected compromised.

### Non-goals
- Defining stego codec internals (LSB/DCT/etc.).
- Replacing Matrix E2EE; this layer complements transport-level encryption.
- Guaranteeing perfect deniability if endpoint devices are fully compromised.

---

## 3) Threat model assumptions

- Adversary can observe message content, metadata, and timing on the server side.
- Adversary may obtain partial backend database snapshots.
- One or more client devices may be compromised.
- Room membership/auth state comes from the primary identity/E2EE system.

Security objective: a compromise should be scoped to one room + one key epoch whenever possible.

---

## 4) Open indicator protocol

## 4.1 Purpose
The open indicator protocol is an unencrypted, low-sensitivity metadata envelope that tells clients **how** to handle a stego payload without exposing secrets.

## 4.2 Envelope shape (v1)
Publish in message content under a stable key, e.g. `blackout.stego.indicator.v1`:

- `protocolVersion`: integer, currently `1`.
- `roomId`: room identifier.
- `channelId`: stable UUID for a stego channel/profile in that room.
- `epoch`: key epoch number (monotonic).
- `keyId`: opaque short identifier (for lookup only, not key material).
- `kdfSuite`: e.g. `argon2id-v1`.
- `cipherSuite`: e.g. `xchacha20poly1305-v1`.
- `createdAt`: ISO-8601 timestamp.
- `expiresAt`: optional ISO-8601 timestamp.
- `flags`: array (`rotation_pending`, `recovery_mode`, `high_risk`).
- `sig`: detached signature over canonicalized indicator fields by room stego authority key.

## 4.3 Protocol rules
- Unknown fields MUST be ignored (forward compatibility).
- Unknown `protocolVersion` MUST fail closed for encode/decode and show a user-visible compatibility warning.
- `epoch` MUST increase by exactly one per completed rotation.
- Indicator signatures MUST verify before a client attempts decode.
- Indicator objects are append-only in event history; corrections are emitted as new events.

## 4.4 Backend responsibilities
- Validate schema/canonicalization and reject malformed indicators.
- Verify signer authorization for indicator-emitting events.
- Persist indicator timeline with immutable audit records.
- Expose current effective indicator via `GET /rooms/{roomId}/stego/state`.
- Emit websocket/sync updates when indicator changes.

## 4.5 Client responsibilities
- Verify signature and protocol compatibility before attempting decode.
- Pin latest valid indicator per `roomId + channelId`.
- Show explicit UX state for `rotation_pending`, `recovery_mode`, and incompatible versions.
- Refuse encode when indicator cannot be validated.

---

## 5) Group password derivation and storage

## 5.1 Derivation model
Use a **group passphrase only as input**, never as direct encryption key.

Per room/channel/epoch derive a key-encryption-key (KEK):

`KEK = Argon2id(passphrase, salt = H(roomId || channelId || epoch || serverPepperId), params = policy)`

Then derive operational subkeys via HKDF:
- `encKey = HKDF(KEK, info="stego-enc")`
- `macKey = HKDF(KEK, info="stego-mac")`
- `wrapKey = HKDF(KEK, info="stego-wrap")`

## 5.2 Storage model
### Backend stores
- `keyId`, `epoch`, `kdfSuite`, salt metadata (or derivable salt components), policy version.
- Wrapped room stego key material (`wrappedRoomKey`) encrypted by `wrapKey` OR by a service KMS key when passphrase-independent recovery is enabled.
- Secret classification tags and audit fields.

### Backend MUST NOT store
- Raw group passphrase.
- Unsalted or reusable passphrase hash.
- Plain room stego keys.

### Client stores
- Passphrase only in OS secure storage when user opts in.
- Local cache of derived keys in memory with short TTL and zeroization on app lock/background timeout.

## 5.3 Parameter policy baseline
- Argon2id memory and iterations are centrally policy-controlled and versioned.
- Minimum passphrase entropy policy exposed to clients via capability endpoint.
- Re-derivation required whenever epoch changes.

## 5.4 Backend responsibilities
- Publish current KDF policy and deprecation schedule.
- Enforce passphrase quality checks at creation/rotation time.
- Keep tamper-evident audit logs for key lifecycle operations.

## 5.5 Client responsibilities
- Enforce local passphrase UX checks before submission.
- Never log passphrases/derived keys.
- Support secure-storage opt-in/out and explicit user wipe.

---

## 6) Rotation policy

## 6.1 Rotation triggers
Automatic rotation when any of the following happens:
- Time-based TTL reached (default: every 30 days).
- Membership risk event (admin leave, forced removal, privilege escalation).
- Crypto policy upgrade (`kdfSuite`/`cipherSuite` deprecation).
- Manual admin action.

## 6.2 Rotation phases
1. **Prepare**: backend issues new indicator with `rotation_pending`, next epoch `N+1`, and grace window.
2. **Distribute**: clients with old epoch can still decode; new sends MUST use epoch `N+1`.
3. **Commit**: after quorum window or deadline, backend marks `N` read-only.
4. **Retire**: old epoch disabled for encode/decode except break-glass forensic role.

## 6.3 Grace window guidance
- Default grace: 72 hours.
- High-risk rooms may set 0-24 hours.
- Expired grace forces hard cutover.

## 6.4 Backend responsibilities
- Drive epoch state machine and guarantee monotonic epoch advancement.
- Block sends with stale epoch after commit.
- Publish rotation telemetry (`pending_clients`, `deadline`, `failure_count`).

## 6.5 Client responsibilities
- Fetch/ack new indicators promptly.
- Auto-migrate sending key to newest epoch.
- Prompt user when passphrase re-entry is required for new epoch.
- Surface clear errors when trying to send with retired epoch.

---

## 7) Compromised-key recovery

## 7.1 Detection inputs
- User/admin compromise reports.
- Anomalous decode/signature failures crossing threshold.
- SIEM/KMS alerts indicating key misuse.

## 7.2 Recovery states
- `suspected`: elevated monitoring; optional soft-rotate prep.
- `confirmed`: immediate freeze on current epoch sends.
- `recovery_mode`: emergency epoch creation, forced re-derivation, strict membership revalidation.
- `recovered`: normal operations resume with postmortem reference.

## 7.3 Emergency recovery flow
1. Backend flags channel as `recovery_mode` and emits signed indicator update.
2. Backend disables compromised `keyId` for encryption immediately.
3. Clients block send, show incident banner, and request re-auth + new passphrase ceremony.
4. Admins reissue channel secret (new epoch + keyId), optionally prune at-risk members.
5. Clients re-derive keys, re-enable send after successful confirmation.

## 7.4 Data retention and containment
- Keep encrypted historical payloads; do not retroactively mutate message history.
- Mark affected epoch range as potentially exposed.
- Maintain immutable incident audit trail (who, when, why, actions).

## 7.5 Backend responsibilities
- Provide emergency endpoints:
  - `POST /rooms/{roomId}/stego/compromise/report`
  - `POST /rooms/{roomId}/stego/recovery/start`
  - `POST /rooms/{roomId}/stego/recovery/complete`
- Enforce role-based access and dual-authorization for recovery start in high-assurance rooms.
- Integrate with KMS revoke/disable operations where applicable.

## 7.6 Client responsibilities
- Treat `recovery_mode` as hard stop for stego send.
- Guide user through recovery ceremony with explicit confirmation steps.
- Require fresh local authentication before revealing cached passphrase or secure-storage secret.

---

## 8) Backend/client responsibility matrix

| Capability | Backend | Client |
|---|---|---|
| Indicator protocol | Validate, sign-authorize, store immutable history, publish state API and sync events | Verify signatures/version, cache latest valid indicator, enforce fail-closed behavior |
| Password derivation/storage | Publish KDF policy, store metadata + wrapped keys only, audit all key ops | Derive keys locally, secure-store passphrase optionally, zeroize memory |
| Rotation | Run epoch state machine, enforce cutover, expose telemetry | Auto-switch to new epoch, prompt for re-derivation, show rotation UX |
| Compromise recovery | Trigger recovery states, freeze compromised keys, expose incident endpoints | Block sends in recovery mode, run recovery wizard, require fresh auth |

---

## 9) Operational safeguards

- All stego key operations are logged to tamper-evident audit pipeline.
- Metrics:
  - rotation success rate,
  - mean cutover time,
  - recovery MTTR,
  - stale-client percentage.
- Quarterly chaos drills:
  - simulated compromised epoch,
  - forced policy upgrade,
  - partial client offline during rotation.

---

## 10) Rollout plan (recommended)

1. **Phase A**: ship open indicator protocol + signature verification (read-only visibility).
2. **Phase B**: enforce derivation/storage policy and block insecure legacy channel configs.
3. **Phase C**: enable automatic rotation with telemetry-only grace at first.
4. **Phase D**: enable full compromised-key recovery workflow and run game-day validation.

This sequencing minimizes lockout risk while progressively increasing security guarantees.
