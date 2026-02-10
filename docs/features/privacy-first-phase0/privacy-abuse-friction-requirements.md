# Privacy + Abuse-Friction Requirements (Phase 0)

This document defines acceptance criteria for privacy guarantees and structural abuse prevention controls.

## A. Privacy requirements

### A1. Content confidentiality

- Message plaintext and decoded stego payloads are only available on endpoint clients.
- Homeservers, relays, billing systems, and analytics must operate without plaintext content access.

**Acceptance criteria**

- End-to-end tests confirm server paths process ciphertext only.
- Static/API reviews show no plaintext fields in server contracts.

### A2. Revenue/content separation

- Monetization decisions are based only on entitlement state and infrastructure tiering.
- No billing feature may require reading message content, room semantics, or contact graph meaning.

**Acceptance criteria**

- Entitlement checks accept user/device/tier context only.
- Audit trails prove paid feature enforcement is content-blind.

### A3. Ephemerality as a technical control

- Every room/message path must support enforceable expiry.
- Expired data is deleted/garbage-collected within defined SLA.

**Acceptance criteria**

- Expiry tests validate send -> receive -> expire -> purge lifecycle.
- Metrics include expiry success ratio and GC lag thresholds.

## B. Abuse-friction requirements

### B1. Scale resistance

- New/untrusted accounts have strict initiation and invite velocity limits.
- Mass broadcast/repost patterns are blocked by default.

**Acceptance criteria**

- Simulated spam campaigns are rate-limited below defined throughput thresholds.
- Forwarding/broadcast controls cannot be bypassed via standard clients.

### B2. Persistence resistance

- Mandatory expiry upper bounds apply in all standard configurations.
- No permanent archive mode for high-risk distribution contexts.

**Acceptance criteria**

- Room policy tests show enforced max TTL caps.
- Expired media/event access returns tombstone/not found behaviors.

### B3. Economic friction

- High-capacity behaviors require durable identity/payment continuity.
- Disposable/non-boosted infrastructure receives stricter throughput envelopes.

**Acceptance criteria**

- Capacity tests show boost tiers alter reliability only, not content handling.
- Abuse simulation confirms cost/continuity controls reduce repeat abuse velocity.

## C. Plugin and extension requirements

- Plugins run client-side only in sandbox runtime.
- Permissions are explicit, revocable, and least privilege.
- No background networking unless explicitly approved by the user.

**Acceptance criteria**

- Plugin conformance suite blocks disallowed APIs and hidden network egress.
- Permission prompts are clear and logged locally for auditability.

## D. Go/no-go gates for implementation phases

Before moving past any phase:

1. Threat model delta reviewed and signed.
2. Privacy invariant tests passing.
3. Abuse-friction simulation report accepted.
4. Incident response procedure validated for new data/key paths.
