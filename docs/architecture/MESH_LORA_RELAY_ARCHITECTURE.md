# Phased Mesh + LoRa Relay Architecture

Status: Proposed  
Last updated: 2026-04-09

## 1) Scope

This document proposes a phased architecture for **offline-capable message relay** using:
- Short-range peer mesh links (BLE/Wi-Fi Direct where available)
- Long-range LoRa relay hops for delay-tolerant transport
- Store-and-forward messaging with strong cryptographic envelopes

Focus areas:
- Offline relay constraints
- Routing model
- Encryption envelope
- Device compatibility assumptions
- Operational boundaries

---

## 2) Design goals and non-goals

### Goals
- Deliver small, high-value messages under intermittent/no internet conditions.
- Tolerate sparse topology and long relay delays.
- Preserve confidentiality/integrity across untrusted relay nodes.
- Support heterogeneous devices with graceful degradation.

### Non-goals
- Real-time streaming media over LoRa.
- Large file transport across low-bandwidth links.
- Global guaranteed delivery under adversarial jamming.

---

## 3) Constraints for offline message relay

## 3.1 Physical/link constraints

- LoRa throughput is extremely limited and region/profile dependent.
- Duty-cycle and airtime constraints cap transmission frequency.
- Packet payload sizes are small; fragmentation is costly.
- Long-range links are variable with high latency and packet loss.

## 3.2 Product constraints

- Messages must be compact and prioritized.
- Delivery may be delayed minutes to hours depending on relay density.
- Retries must be bounded to avoid airtime exhaustion.
- Store-and-forward queues require strict TTL and size caps.

## 3.3 Suggested relay policy limits (baseline)

- Max encrypted payload per fragment: profile-dependent, target minimal.
- Message TTL classes: `urgent` (15m), `normal` (2h), `bulk` (24h).
- Max hop count: 3-7 (configured by region/network health).
- Max outstanding relay queue per node with LRU/priority eviction.

---

## 4) Phased architecture

## Phase 1 — Local mesh only (no LoRa)

- BLE/Wi-Fi Direct opportunistic peer exchange.
- Store-and-forward on-device queue.
- Simple epidemic forwarding with dedupe.
- Goal: validate identity, envelope, and queue semantics.

## Phase 2 — Single-gateway LoRa bridge

- Mobile/edge gateway bridges local mesh to LoRa channel.
- Uplink/downlink with strict rate and class-based priority.
- Goal: validate long-range relay and duty-cycle management.

## Phase 3 — Multi-hop LoRa relay mesh

- Multiple relay-capable nodes perform bounded multi-hop forwarding.
- Route scoring (link quality, energy, congestion) and loop prevention.
- Goal: improve reach in sparse/disconnected zones.

## Phase 4 — Hybrid adaptive routing

- Dynamic path selection across mesh-only, LoRa, and internet backhaul (if available).
- Policy-aware routing for urgency, size, trust tier, and energy state.
- Goal: robust operational deployment with observability and controls.

---

## 5) Routing model

## 5.1 Addressing and identity

- Each device has stable `device_id` + rotating session identifiers.
- Destination addressed as `recipient_id` (user/group endpoint abstraction).
- Relay nodes forward based on destination hints, not plaintext content.

## 5.2 Forwarding strategy

Hybrid DTN strategy:
- **Primary**: store-carry-forward with encounter-based opportunistic transfer.
- **Secondary**: bounded controlled flooding in sparse networks.
- **Optional**: gateway-assisted directed routing when topology knowledge exists.

## 5.3 Route selection heuristics

- Link quality index (RSSI/SNR trend).
- Estimated delivery delay.
- Node energy budget.
- Queue pressure/congestion score.
- Trust/reputation class for relay path.

## 5.4 Loop and duplicate control

- Message ID + nonce-based dedupe cache.
- Hop counter decremented at each forward.
- Bloom-filter or compact seen-set summary exchange.
- Per-peer anti-replay window.

## 5.5 Acknowledgement model

- Hop ACK for local reliability tuning.
- End-to-end delivery receipts (optional by message class).
- Negative ACK/expiry notices to stop futile retries.

---

## 6) Encryption envelope

## 6.1 Threat model assumptions

- Relay nodes and intermediate links are untrusted.
- Metadata leakage should be minimized but cannot be zero in low-bandwidth systems.
- Devices may be captured; key rotation and revocation are required.

## 6.2 Envelope structure (logical)

- **Outer transport header (minimal cleartext):**
  - protocol version
  - message type/class
  - ttl/hop budget
  - destination hint token (opaque)
  - fragment sequence metadata
- **Encrypted payload (AEAD):**
  - sender + recipient logical IDs (or group epoch)
  - message body
  - timestamp + monotonic counter
  - optional attachments pointer/token
- **Authentication material:**
  - sender signature/MAC over header+ciphertext

## 6.3 Crypto controls

- End-to-end encryption with forward secrecy where session model allows.
- AEAD ciphers with unique nonce discipline.
- Periodic key rotation and session rekey triggers.
- Group messaging via epoch keys with membership-change rekey.
- Envelope size budgeting to fit constrained payload fragments.

## 6.4 Key management requirements

- Initial trust bootstrap via out-of-band or pre-provisioned identity.
- Revocation list distribution via opportunistic sync + gateways.
- Secure enclave/keystore usage where hardware supports it.

---

## 7) Device compatibility assumptions

## 7.1 Device classes

- **Class A (full gateway)**: smartphone/edge device with BLE/Wi-Fi + LoRa module + intermittent internet.
- **Class B (relay node)**: dedicated LoRa relay (low-power SBC/MCU) with local storage.
- **Class C (endpoint only)**: constrained handset/sensor with mesh only, no LoRa radio.

## 7.2 Baseline assumptions

- Not all devices have LoRa hardware.
- Some devices cannot background-process continuously (mobile OS limits).
- Battery and thermal constraints may disable aggressive scanning/forwarding.
- Firmware diversity requires conservative protocol version negotiation.

## 7.3 Compatibility strategy

- Feature negotiation during peer handshake.
- Mandatory core profile + optional extension capabilities.
- Backward-compatible envelope versioning.
- Capability-aware routing (avoid assigning unsupported relay roles).

---

## 8) Operational boundaries

## 8.1 What the system is designed for

- Low-bandwidth asynchronous messaging.
- Emergency/degraded communications in local/regional areas.
- Bounded trust collaboration with auditable control-plane policies.

## 8.2 What the system is not designed for

- Guaranteed low-latency delivery.
- Heavy media transfer.
- Operation in fully jammed or legally restricted radio environments.

## 8.3 Governance and regulatory boundaries

- Radio operation must follow regional spectrum rules and duty-cycle limits.
- Transmit power/channel plans managed per jurisdiction.
- Data retention and legal intercept obligations handled at policy layer.

## 8.4 Operational guardrails

- Queue TTL enforcement and automatic stale-drop.
- Rate limits by priority class and node role.
- Kill-switch for compromised keys/protocol versions.
- Periodic health beacons and relay liveness scoring.

---

## 9) Observability and SLO guidance

Key telemetry:
- Delivery latency distribution by class/hop count.
- Relay queue depth and drop reasons.
- Duplicate suppression rate.
- Link quality trends and route churn.
- Battery impact per role (gateway/relay/endpoint).

Suggested SLOs (initial):
- `urgent` class delivery success within TTL: >= 95% in target coverage zones.
- Duplicate delivery rate: <= 1% after dedupe.
- Queue overflow drops: <= 2% under nominal load.

---

## 10) Implementation roadmap

1. Build canonical message envelope + key lifecycle primitives.
2. Ship Phase 1 mesh relay prototype with replay/dedupe controls.
3. Add Phase 2 gateway LoRa bridge and duty-cycle scheduler.
4. Introduce Phase 3 bounded multi-hop routing with policy controls.
5. Harden with Phase 4 adaptive routing + observability-driven tuning.
