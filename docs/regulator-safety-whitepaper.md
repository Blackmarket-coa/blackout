# Regulator-Facing Safety Whitepaper

## Purpose and scope

This document explains how a strongly private messaging system can reduce child sexual abuse material (CSAM) risk **without weakening end-to-end encryption (E2EE)**.

The approach is based on structural safeguards (friction, cost, limits, and short data lifetime) rather than content surveillance.

## Core model

### What the platform does not do

- Does not read message plaintext.
- Does not hold room keys for E2EE rooms.
- Does not run blanket client-side CSAM scanning.
- Does not monetize message content.

### What the platform does do

- Applies transport and account controls to reduce abuse scalability.
- Uses paid features to add economic friction to high-volume misuse.
- Enforces strict ephemerality and hard retention ceilings.
- Limits discoverability and viral spread mechanics.

## Revenue model and safety alignment

### 1) Privacy-first subscription

Users pay for capabilities, not surveillance.

Examples:

- Higher stego payload limits within fixed global caps.
- Additional verified devices.
- Faster encrypted key sync.
- Advanced key rotation controls.
- Client-side encrypted backup features.

Safety alignment:

- Strict payload ceilings and contact-rate limits remain in place for all tiers.
- No unlimited broadcasting features are sold.
- Subscription status changes product ergonomics, not content visibility.

### 2) Federation / homeserver boosts

Operators or communities fund reliability improvements:

- Higher bandwidth and retry depth.
- Redundant encrypted relays.
- Better anti-DDoS posture.

Safety alignment:

- Capacity remains conditional on policy compliance and anti-abuse controls.
- Disposable abuse infrastructure becomes less economical over time.
- Transport quality increases without exposing message plaintext.

### 3) Paid encrypted rooms and creator keys

Access is sold as cryptographic membership, not central moderation override.

- Creators issue room keys to paid members.
- Keys can be time-bound, device-bound, revoked, and rotated.

Safety alignment:

- Financial and identity continuity raise abuse costs.
- Public indexing is off by default for paid private rooms.
- Rapid key rotation supports incident containment.

### 4) Client-side plugin marketplace

Developers ship local features under explicit, sandboxed permissions.

Safety alignment:

- Plugins cannot read plaintext by default.
- Network egress is denied unless user-authorized.
- Capability-scoped APIs prevent hidden exfiltration patterns.

### 5) Cosmetics and symbolic digital goods

Revenue from non-communication goods:

- Themes, profile cosmetics, sticker packs, emoji alphabets.

Safety alignment:

- No effect on encryption or metadata collection.
- Minimal abuse utility and low automation value.

## CSAM risk reduction strategy (without breaking E2EE)

### Pillar A: Ephemerality by design

- Mandatory message expiry windows for high-risk channels.
- Hard-delete semantics and bounded relay cache lifetime.
- No long-term server archives for ephemeral contexts.

### Pillar B: Economic friction

- Payment and verification gates for scale-heavy capabilities.
- Tiered throughput with strict baseline constraints.
- Delayed trust progression for newly created accounts.

### Pillar C: Distribution friction

- No anonymous mass-broadcast primitives.
- Limited discoverability and invite-rate controls.
- Progressive limits for high fan-out behavior.

### Pillar D: Decentralized blast-radius control

- No single global plaintext repository exists.
- Homeserver-level controls allow local containment.
- Federation controls can isolate repeatedly abusive nodes.

### Pillar E: Cryptographic authority at endpoints

- Users and room operators control keys.
- Key revocation and rotation are first-class operations.
- Platform cannot silently override encryption guarantees.

## Enforcement and legal posture

### Trust and safety without content surveillance

The system focuses on abuse prevention by architecture:

- Constraining scale and persistence.
- Increasing operational cost for adversaries.
- Providing endpoint-level recovery and containment tools.

### Regulator-facing positioning

> We reduce abuse by making the network economically, temporally, and structurally hostile to exploitation, while preserving end-to-end encryption and minimizing data collection.

### Why this is auditable

- Limits and expiry values are explicit product policies.
- Key management flows are deterministic and testable.
- Billing and safety controls can be independently audited without access to private content.

## Operational commitments

- Publish anti-abuse control thresholds (at least in ranges).
- Keep transparent reporting on enforcement actions and federation blocks.
- Conduct periodic external reviews of key lifecycle and plugin sandbox boundaries.
- Maintain clear user notices on what data is collected and why.

## Conclusion

Strong privacy and meaningful safety are compatible when abuse prevention is treated as an infrastructure and economics problem rather than a surveillance problem.
