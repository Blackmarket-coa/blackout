# ADR: Privacy-First Stack Boundaries and Trust Separation

- **Status:** Accepted (Phase 0)
- **Date:** 2026-02-10
- **Owners:** Security/Privacy, Client, Federation/Infra, Commerce

## Context

The product requires strong E2EE, steganographic transport wrappers, ephemerality, monetization, and structural abuse prevention without violating content privacy.

Without strict trust boundaries, accidental coupling between identity, billing, and encrypted content could undermine both privacy claims and legal defensibility.

## Decision

Adopt five-layer separation with strict data ownership:

1. **Client Layer**
    - Owns keys, encryption/decryption, stego encode/decode, local TTL policy execution.
2. **Matrix/Federation Layer**
    - Owns encrypted event transport, federation routing, and expiry enforcement.
3. **Infrastructure Layer**
    - Owns reliability controls (relay/cache/retry/anti-DDoS), never plaintext semantics.
4. **Commerce Layer**
    - Owns subscriptions/boosts/payouts/entitlements, never message content or room plaintext.
5. **Governance/Safety Layer**
    - Owns abuse-friction controls, key lifecycle controls, and legal operations.

## Non-negotiable invariants

1. No service may access both decrypted content and billing identity records.
2. Monetization logic must be content-blind (capability-based only).
3. Plugin execution is client-side only and capability scoped.
4. Ephemerality must include technical deletion/expiry, not policy text alone.
5. Key material for paid room access is never retained by platform services.

## Threat model baseline

### Threat actors

- Opportunistic spammer using low-cost/disposable accounts.
- Networked abuser seeking high-volume distribution with persistence.
- Malicious plugin developer attempting exfiltration.
- Rogue infrastructure operator attempting metadata/content expansion.

### Primary controls by actor

- **Spammer/abuser:** rate limits, account trust tiers, anti-broadcast friction, room growth caps.
- **Plugin attacker:** sandbox runtime, explicit permissions, no background network by default.
- **Infra operator risk:** strict service contracts and content-blind API boundaries.

## Consequences

### Positive

- Strong architectural alignment with E2EE claims.
- Auditable separation of business and content systems.
- Better legal defensibility for “cannot provide plaintext” posture.

### Trade-offs

- Higher implementation complexity in entitlement and key lifecycle flows.
- More up-front design work for API contracts and observability boundaries.

## Implementation notes (Phase 1 dependencies)

- Add automated checks that block schema/API additions crossing boundary constraints.
- Ensure analytics schemas are reviewed for content leakage before deployment.
- Include boundary checks in release readiness gates.
