# Phase 3 Implementation Artifacts — Entitlements and Subscription Capabilities

This directory contains completion evidence for **Phase 3 — Entitlements and Subscription Capabilities** from the privacy-first steganographic roadmap.

## Workstream deliverables

### 1. Isolated billing service + entitlement token service

- `src/steganography/entitlements/EntitlementInfrastructure.ts`
    - `BillingService` and `BillingAccountState` interfaces define a narrow billing boundary.
    - `EntitlementTokenService` derives short-lived entitlement tokens from billing state without room/message identifiers.
    - Billing degradations explicitly fall back to free-tier capability envelopes.

### 2. Client enforcement for feature unlocks

- `src/steganography/entitlements/EntitlementManager.ts`
    - Tier capability caps for payload size, expiry horizon, and linked devices.
    - `evaluateAndAudit()` verifies token freshness and entitlement caps before send.

### 3. Server enforcement only for safety invariants and anti-abuse ceilings

- `src/steganography/entitlements/EntitlementInfrastructure.ts`
    - `ServerSafetyInvariantEnforcer` enforces protocol-level caps (`eventsPerMinute`, `bytesPerMinute`) only.
    - No message, room, or payload-content fields are present in safety request/decision types.

### 4. Audit logs proving entitlement checks are content-blind

- `src/steganography/entitlements/EntitlementInfrastructure.ts`
    - `EntitlementAuditLogger` stores only coarse metadata buckets.
    - Bucketing utilities intentionally quantize payload size, expiry request, and device count.

## Exit criteria evidence

### Subscription state never coupled to room/message identifiers

- Entitlement issuance and checks consume only account/user/device/tier/time metadata.
- No `roomId`, event IDs, message IDs, ciphertext, or plaintext fields are present in token, billing, or audit interfaces.

### Billing outages degrade paid features safely without exposing content

- `EntitlementTokenService.issueFromBilling()` returns free-tier temporary tokens when subscription state is inactive.
- Feature access gracefully degrades while preserving content-blind request handling.

## Test inventory

| Test file                                                         | Coverage area                                                                                            |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `test/unit-tests/steganography/EntitlementManager-test.ts`        | Tier limits, active token windows, send gating                                                           |
| `test/unit-tests/steganography/EntitlementInfrastructure-test.ts` | Billing fallback behavior, metadata-only audits, server invariant limits, deterministic bucket functions |

## Phase 3 completion checklist

- [x] Isolated billing service + entitlement token service.
- [x] Client enforcement for feature unlocks.
- [x] Server enforcement only for safety invariants and anti-abuse ceilings.
- [x] Audit logs proving entitlement checks are content-blind.
- [x] Subscription state never coupled to room/message identifiers.
- [x] Billing outages degrade paid features safely without exposing content.
