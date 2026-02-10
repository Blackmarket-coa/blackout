# Privacy-First Steganographic Messaging Roadmap

This roadmap translates the conversation ideas into an implementation plan for a Matrix-based messaging product with:

- strong end-to-end encryption,
- client-side steganography,
- enforced ephemerality,
- privacy-preserving monetization,
- structural CSAM risk reduction without content scanning.

## 1. Product Principles (Non-Negotiable)

1. **No service can access both identity and content.**
2. **Revenue is based on capabilities/infrastructure, not message behavior.**
3. **Keys are access control; platforms do not grant plaintext access.**
4. **Ephemerality is technical, not policy-only.**
5. **Plugins are client-side sandboxed and capability-scoped.**
6. **Abuse prevention relies on friction/cost/limits, not blanket content inspection.**

## 2. Target Stack Boundaries

### Client Layer (trust anchor)

- Matrix SDK integration (web/mobile).
- E2EE + key management (Olm/Megolm + hardened local key storage).
- Steganography toolkit (emoji + PNG carrier paths).
- Local policy engine (TTL, payload caps, forwarding/rebroadcast friction).
- Plugin sandbox + capability permissions.

### Matrix/Federation Layer

- Homeserver transport and encrypted event relay.
- TTL/expiration enforcement and event garbage collection.
- Federation retry and routing controls.
- Abuse friction controls for account/server behavior.

### Infrastructure Layer

- Relay/media proxy with time-bounded encrypted caching.
- Boost capacity pools and anti-DDoS posture.
- Reliability controls detached from content semantics.

### Commerce Layer (strictly separated)

- Billing (subscriptions, boosts, digital goods).
- Entitlements API (feature capability tokens).
- Creator payouts and paid-room key-issuance accounting.

### Governance/Safety Layer

- Technical controls (rate limits, room size caps, invite controls).
- Key revocation/rotation workflows.
- Legal interface for metadata-only responses.

## 3. Delivery Phases

## Phase 0 — Foundations and Threat Modeling (2-4 weeks)

**Goals**

- Finalize trust boundaries and data flow maps.
- Define attacker models: spammer, stalker, coordinated illegal-content distribution, malicious plugin developer.
- Establish security/privacy invariants and engineering acceptance criteria.

**Deliverables**

- Architecture decision records (ADRs) for stack boundaries.
- Data classification matrix (identity, payment, transport metadata, encrypted payload).
- Privacy and abuse-friction requirements document.
- Minimal legal response playbook (what can/cannot be produced).

**Exit criteria**

- Every planned feature mapped to exactly one layer owner.
- No unresolved flow where billing/analytics can touch plaintext artifacts.

## Phase 1 — Core E2EE + Ephemerality Baseline (6-10 weeks)

**Goals**

- Stand up secure Matrix messaging baseline with strong deletion semantics.

**Workstreams**

1. Integrate Matrix SDK flows with strict encrypted-room defaults.
2. Implement local TTL controls + homeserver expiration enforcement.
3. Build hard safety caps (message size, attachment size, contact initiation limits).
4. Add anti-amplification controls (no unrestricted forwarding/broadcast).

**CSAM risk reduction outcomes**

- Time persistence reduced via mandatory expiry windows.
- Distribution scale reduced through technical sharing limits.

**Exit criteria**

- Encrypted message lifecycle tests pass for send/receive/expire/delete.
- Hard cap controls cannot be disabled by UI toggles.

## Phase 2 — Client-Only Steganography Toolkit (5-8 weeks)

**Goals**

- Add stego channels without introducing server-side decode points.

**Workstreams**

1. Emoji carrier encoder/decoder with deterministic chunking.
2. PNG-only image stego with integrity checks (AEAD + CRC/optional RS).
3. Carrier compatibility validator for platform-safe character sets.
4. Versioning format for stego payload headers inside encrypted bodies.

**Security requirements**

- No stego encode/decode network calls.
- Decoding only after decryption and authenticity checks.

**Exit criteria**

- Property tests for round-trip correctness and corruption handling.
- Telemetry review confirms no plaintext/stego payload collection.

## Phase 3 — Entitlements and Subscription Capabilities (4-6 weeks)

**Goals**

- Launch privacy-first subscription without cross-layer data leakage.

**Paid features candidates**

- Larger stego payload ceilings.
- More linked devices.
- Faster key sync cadence.
- Enhanced key rotation policies.
- Extended (but capped) ephemeral controls.
- Encrypted client-side backup allowances.

**Workstreams**

1. Isolated billing service + entitlement token service.
2. Client enforcement for feature unlocks.
3. Server enforcement only for safety invariants and anti-abuse ceilings.
4. Audit logs proving entitlement checks are content-blind.

**Exit criteria**

- Subscription state never coupled to room/message identifiers.
- Billing outages degrade paid features safely without exposing content.

## Phase 4 — Federation Boosts and Infrastructure Monetization (4-6 weeks)

**Goals**

- Monetize transport reliability while preserving content blindness.

**Workstreams**

1. Define boost tiers (retry priority, relay redundancy, bandwidth envelopes).
2. Add homeserver/community server revenue share accounting.
3. Introduce throttling differentials that target infrastructure abuse patterns.
4. Publish transparent boost accounting dashboard.

**CSAM risk reduction outcomes**

- Reduces abuse viability on disposable low-cost infra.
- Raises sustained cost for high-volume dissemination behavior.

**Exit criteria**

- Boost logic uses server/account tier metadata only.
- No packet/event inspection beyond protocol/size/rate-level controls.

## Phase 5 — Paid Encrypted Rooms and Creator Keys (6-8 weeks)

**Goals**

- Enable creator monetization through cryptographic key distribution.

**Workstreams**

1. Room key issuance and delivery service (stateless, no key retention).
2. Payment verification to trigger key grant workflow.
3. Device binding, key rotation, and immediate revocation tooling.
4. Private room discovery defaults (no global indexing).

**Safety posture**

- Financial friction + identity continuity for access.
- Fast revocation and forced rekey on abuse suspicion.

**Exit criteria**

- Platform cannot decrypt paid-room messages by design.
- Creator tooling can rotate/revoke keys within target SLA.

## Phase 6 — Plugin Ecosystem and Cosmetic Marketplace (6-10 weeks)

**Goals**

- Open monetizable ecosystem without turning plugins into surveillance vectors.

**Workstreams**

1. WASM/sandboxed JS runtime with capability-based permission manifests.
2. Plugin API primitives (`encode`, `decode`, `render`, `transform`).
3. Hard runtime bans (no raw sockets, no background network unless approved).
4. Cosmetic asset pipeline (signed packs, rendering-only effects).

**Exit criteria**

- Permission prompts are explicit and revocable.
- Plugin conformance tests block disallowed network/exfiltration behavior.

## 4. Cross-Cutting Tracks (Run in Parallel)

### Security Engineering

- External cryptography/stego review before public launch.
- Continuous fuzzing for stego parsers and decoder boundaries.
- Secret/key incident response runbooks.

### Abuse Friction Program

- Progressive trust tiers for new accounts.
- Invite and room growth velocity controls.
- Known bad-behavior heuristics on metadata only (rate/graph anomalies).

### Privacy and Compliance

- Data minimization by default.
- Region-aware payment/legal retention schedules.
- Transparency reporting for legal requests and policy actions.

### Observability (Privacy-safe)

- Reliability metrics: delivery latency, retry success, expiration success.
- Safety metrics: blocked broadcast attempts, key revocation turnaround.
- Business metrics: entitlement conversion and churn (never content-derived).

## 5. Suggested Milestone Sequence

1. **M1**: Phase 0 complete + sign-off on invariants.
2. **M2**: Encrypted ephemeral messaging baseline live (Phase 1).
3. **M3**: Stego toolkit GA behind feature flag (Phase 2).
4. **M4**: Subscription/entitlements live for capability unlocks (Phase 3).
5. **M5**: Federation boosts and transparent accounting live (Phase 4).
6. **M6**: Paid encrypted rooms with creator key lifecycle live (Phase 5).
7. **M7**: Plugin marketplace + cosmetics live with sandbox controls (Phase 6).

## 6. Go/No-Go Gates

Before each milestone ships, require:

- Threat model updated and signed.
- Privacy invariant checks passed.
- Abuse-friction simulation completed.
- Incident response drill completed for new key/data paths.
- Legal/compliance review for newly retained metadata.

## 7. Initial Team Topology

- **Client Crypto Team**: E2EE, key UX, local policy engine.
- **Stego Team**: encoding/decoding libs + robustness testing.
- **Federation/Infra Team**: homeserver modules, relays, boost controls.
- **Commerce Team**: billing, entitlements, creator payouts.
- **Safety/Trust Team**: abuse friction policies, response tooling.
- **Security/Privacy Team**: reviews, audits, invariants, incident response.

## 8. First 30 Days Action Plan

1. Create ADRs for each stack boundary and non-negotiable rule.
2. Implement baseline TTL + rate-limit controls in development environment.
3. Build a minimal client stego prototype with deterministic decode tests.
4. Stand up a separate entitlement service with mock billing events.
5. Draft creator-key lifecycle spec (issue, rotate, revoke).
6. Define plugin permission manifest schema and enforcement tests.
7. Produce initial transparency report template and legal response matrix.

## 9. Success Definition

The roadmap succeeds if the product can honestly demonstrate:

- message confidentiality remains E2EE end-to-end,
- monetization never depends on content visibility,
- ephemerality and abuse friction are enforced technically,
- creator/plugin ecosystems are viable without opening surveillance channels.
