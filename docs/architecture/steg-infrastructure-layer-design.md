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

---

## 11) Phased rollout plan for paid stego codecs

Paid codecs are gated as premium capabilities and roll out in ascending complexity:

- **Phase P1 (Image codec GA first)**: lowest decode risk and broadest hardware support.
- **Phase P2 (Audio codec limited GA)**: medium complexity, codec/container variability.
- **Phase P3 (Video codec controlled GA)**: highest anti-detection and performance risk.

Each phase includes launch criteria, per-platform kill switch, and abuse/safety review before expansion.

## 11.1 Common pricing gate contract

All paid codec sends/decodes require entitlement checks against a billing capability service.

- Capability flags:
  - `features.stego.codec.image.paid`
  - `features.stego.codec.audio.paid`
  - `features.stego.codec.video.paid`
- Entitlement response fields:
  - `planTier` (`free`, `signal`, `sovereign`, `enterprise`)
  - `quota` (monthly encode/decode limits by codec)
  - `maxPayloadBytes` (per codec)
  - `expiresAt`
- Hard requirements:
  - Backend re-validates entitlement at send-time (never trust client gate alone).
  - Client performs preflight check to avoid failed uploads.
  - Grace handling: if billing service is degraded, previously validated sessions get short fail-open window (for example 15 minutes) and are fully audited.

## 11.2 Codec-specific rollout details

### A) Paid image stego codec (Phase P1)

**Algorithm choice criteria**
- Prefer transform-domain embedding (DCT/wavelet) over naive LSB for premium mode to improve robustness through recompression.
- Must support deterministic payload framing with authenticated encryption.
- Must preserve acceptable quality at social-share resolutions.

**Quality/performance budget**
- Encode latency target: <= 250 ms at 1080p on recent devices; <= 600 ms on low-end devices.
- Decode latency target: <= 150 ms median for 1080p.
- Visual quality budget: SSIM >= 0.98 and PSNR >= 40 dB versus source.
- Payload budget: default 2-8 KB hidden data per image, codec/profile dependent.

**Device compatibility**
- Required: iOS 16+, Android 10+, modern desktop browsers with WASM SIMD fallback path.
- Fallback: automatic downgrade to free/basic mode or block with user guidance if transform pipeline unsupported.
- Explicitly test JPEG and PNG ingest/output paths across mobile and web.

**Anti-detection risk notes**
- Recompression pipelines can expose statistical artifacts; randomize embedding maps per-message nonce.
- Strip or normalize metadata to avoid side-channel signals (EXIF consistency checks).
- Rate-limit high-volume similar-carrier uploads to reduce classifier confidence.

**Pricing gate integration**
- Entry tier: `signal` or higher.
- Metering unit: successful premium encode.
- Upsell point: when free-tier user selects advanced image mode, show plan compare + estimated remaining monthly quota.

### B) Paid audio stego codec (Phase P2)

**Algorithm choice criteria**
- Prefer spread-spectrum/phase coding hybrids resilient to transcoding and normalization.
- Avoid schemes that break on common voice-note processing chains (AGC, denoise, format conversion).
- Must provide robust synchronization markers for partial clipping scenarios.

**Quality/performance budget**
- Encode latency target: <= 400 ms for 30-second clip on mid-range mobile.
- Decode latency target: <= 300 ms median for 30-second clip.
- Audio quality budget: PESQ/MOS impact within "imperceptible to slight" threshold for speech/music baselines.
- Payload budget: default 1-4 KB per 30 seconds with adaptive reduction for noisy sources.

**Device compatibility**
- Required containers/codecs: AAC-LC (`.m4a`) and Opus (`.ogg`/`.webm`) decode support.
- Mobile background processing support required for files > 20 seconds.
- Fallback path: server-assisted transcode normalization for unsupported sources (behind regional cost controls).

**Anti-detection risk notes**
- Spectral anomalies can be detected in repetitive use; enforce carrier diversity and randomization seeds.
- Voice pipelines (noise suppression, telephony transcoding) increase decode failure and can leak pattern signatures.
- Disallow unsafe parameter presets with known high detectability.

**Pricing gate integration**
- Entry tier: `sovereign` or higher (or `signal` add-on).
- Metering units: clip-minute processed + successful premium encode.
- Add overage controls: hard monthly minute cap with admin-configurable soft warning thresholds.

### C) Paid video stego codec (Phase P3)

**Algorithm choice criteria**
- Prefer motion-aware transform embedding keyed per GOP/frame class.
- Must survive platform transcode profiles where possible (bitrate/resolution adaptation).
- Require explicit robustness scorecard per target container (`mp4/h264`, `webm/vp9`, optional `hevc`).

**Quality/performance budget**
- Encode latency target: <= 1.5x realtime on desktop, <= 2.5x realtime on high-end mobile for <= 60s clips.
- Decode latency target: <= realtime for review workflows.
- Visual quality budget: VMAF drop <= 3 points and no persistent visible flicker/block artifacts.
- Payload budget: default 4-32 KB per minute based on motion and bitrate profile.

**Device compatibility**
- Initial support: desktop + high-end mobile only; mid/low-end mobile decode-only until optimization complete.
- Hardware acceleration required where available; software fallback guarded by thermal/battery budget checks.
- Reject unsupported combinations early (codec/container/profile mismatch) with user-facing remediation.

**Anti-detection risk notes**
- Video carries strongest forensic signal surface (temporal/statistical fingerprints).
- Require per-release red-team evaluation with steganalysis baselines before wider rollout.
- Enable emergency remote kill switch if detection rates exceed policy threshold.

**Pricing gate integration**
- Entry tier: `enterprise` (or controlled `sovereign` pilot).
- Metering units: encoded output-minute + storage/egress multiplier.
- Contract controls: organization-level policy toggles and mandatory audit export for regulated customers.

## 11.3 Phase exit criteria and guardrails

A paid codec phase exits only when all are true:

1. Reliability SLO met for 28 consecutive days.
2. Anti-detection red-team score remains under policy threshold.
3. Billing/entitlement reconciliation error rate below threshold.
4. Support ticket rate per 1k codec operations below threshold.
5. Incident rollback drill completed successfully in the current quarter.

If any threshold regresses, backend forces automatic rollback to previous phase and marks codec as `degraded` in capability APIs.

---

## 12) Steganographic Whispers (standalone capability)

Steganographic Whispers is a distinct messaging capability focused on low-noise, short-lived, covert communication with explicit user consent and policy controls.

## 12.1 User story

> As a user coordinating sensitive information in a room, I want to send a **Whisper** that appears as normal cover content to non-authorized viewers, while authorized recipients can reveal a hidden payload safely and quickly.

Primary outcomes:
- Sender can choose "Whisper" mode without leaving the composer.
- Authorized recipients can reliably detect and reveal the hidden message.
- Non-authorized recipients see only benign cover content.
- The system preserves auditability of control-plane actions without exposing secret payloads.

## 12.2 Protocol behavior

Whispers reuse the stego infrastructure primitives but with stricter defaults.

### Whisper envelope profile
- `mode = whisper`
- `ttl`: required, default 24h, max 168h.
- `maxPayloadBytes`: bounded by codec profile and entitlement tier.
- `audienceHint`: optional, non-sensitive label (e.g., `incident-core`).
- `revealPolicy`: `manual_only` by default (no auto-reveal on open).
- `forwardPolicy`: default `deny` (forward/share disabled unless policy allows).

### Delivery semantics
- Sender must reference a valid indicator (`channelId`, `epoch`, `keyId`) and pass entitlement check.
- Backend validates policy (TTL, payload size, room capability, moderation state).
- Clients without compatible whisper support fail closed for reveal but still render cover text/media.
- On key rotation, whisper decode follows active `epoch` rules; retired epochs are blocked unless break-glass policy allows.

### Reveal semantics
- Reveal requires explicit local user action and fresh auth if secure storage is locked.
- Reveal events produce **control-plane telemetry only** (no plaintext, no raw payload).
- Optional one-time reveal policy can burn local cache immediately after reveal.

## 12.3 UX metaphors

Whispers should feel intentional and understandable, not "magic".

- **Seal metaphor**: sender "seals" a message into ordinary content.
- **Lantern metaphor**: recipient "lights" the content to reveal hidden text.
- **Fuse metaphor**: TTL visualized as a fuse countdown for whisper expiry.
- **Boundary metaphor**: explicit badge differentiates normal encrypted messages vs whispers.

### Core UX components
- Composer toggle: `Normal | Whisper` with concise explainers.
- Whisper card preview: shows cover content + hidden payload size, TTL, and audience label.
- Recipient affordance: "Reveal Whisper" action with passphrase/auth prompt.
- Safety affordance: report/mute actions available at both cover and whisper context levels.

## 12.4 Moderation and safety implications

Whispers increase abuse and review complexity and require guardrails.

### Abuse risks
- Covert harassment or grooming signals in hidden payloads.
- Evasion of keyword-based moderation heuristics.
- Coordinated abuse using rapidly rotated channels.

### Required controls
- Policy gating by trust tier, room type, and region.
- Rate limits for whisper creation and reveal failures.
- Mandatory metadata-level moderation hooks (without payload decryption by default).
- Incident workflow for high-confidence abuse patterns (temporary whisper suspension at room/org scope).

### Moderator visibility model
- By default, moderators see cover content and protocol metadata only.
- Enhanced review mode (policy-controlled, auditable) may require dual authorization and legal basis to access decrypted evidence if enterprise/governance policy permits.
- All moderation escalations must preserve chain-of-custody logs.

### Safety UX requirements
- Clear user-facing disclosures: whispers are private but not guaranteed safe against compromised endpoints.
- In-context report flow for suspicious whispers.
- Age/regulated environment policies can disable whisper capability entirely.

## 12.5 Telemetry and success metrics

Track only operational and behavioral signals needed for reliability/safety/product outcomes.

### Privacy-preserving telemetry principles
- Never collect plaintext hidden payload.
- Hash/aggregate identifiers where possible.
- Retain event-level data with strict TTL and role-based access.

### Core metrics
- Adoption:
  - whisper send rate per eligible DAU,
  - whisper reveal rate,
  - paid codec attach rate in whisper mode.
- Reliability:
  - encode/decode success rate,
  - median reveal latency,
  - stale-epoch decode failure rate.
- Safety:
  - abuse report rate per 1k whispers,
  - false-positive moderation escalation rate,
  - compromise-triggered whisper suspension frequency.
- Business:
  - conversion uplift from whisper paywalls,
  - churn among users hitting whisper limits,
  - entitlement rejection rate at send-time.

### Success criteria (launch + steady state)
- Launch gate:
  - >= 99% decode success in supported clients,
  - < 1% entitlement check failure due to platform faults,
  - moderation escalation SLA compliance >= 99%.
- 90-day steady state:
  - sustained adoption growth in target cohorts,
  - no statistically significant rise in severe abuse rate versus control cohorts,
  - paid conversion target met without reliability regression.
