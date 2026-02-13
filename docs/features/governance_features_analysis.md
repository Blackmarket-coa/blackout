# Governance Features Analysis

This document summarizes the **governance-oriented feature set** implemented in the repository, focusing on policy enforcement, safety invariants, monetization controls, and plugin permission boundaries.

## Scope covered

The analysis covers the governance modules under `src/steganography/`:

- `entitlements/EntitlementManager.ts`
- `entitlements/EntitlementInfrastructure.ts`
- `boosts/FederationBoosts.ts`
- `paidrooms/CreatorKeys.ts`
- `plugins/PluginSandbox.ts`

## 1) Entitlement governance (tiers, limits, audits)

### What it governs

- Tier-scoped capability limits (`free`, `plus`, `pro`) for payload size, expiry window, and linked devices.
- Token activity windows (`issuedAt`/`expiresAt`) before a send can be allowed.
- Deterministic deny reasons (`payload_too_large`, `expiry_too_long`, `too_many_devices`, `token_inactive`).

### Governance controls in code

- `EntitlementManager.getLimits()` defines hard per-tier ceilings.
- `EntitlementManager.canSend()` and `evaluateAndAudit()` enforce request-time policy.
- `EntitlementAuditLogger` records allow/deny decisions using only coarse metadata buckets.

### Governance posture

- **Policy deterministic**: outcomes are tied to explicit, versionable caps.
- **Auditability**: every deny/allow path can be recorded with stable reason codes.
- **Content-blind**: audit fields are bucketed metadata, not payload contents.

## 2) Billing boundary + safety invariants

### What it governs

- Separation between business state (billing/subscription) and protocol enforcement.
- Fallback behavior when billing is inactive.
- Server-level anti-abuse limits independent of message content.

### Governance controls in code

- `EntitlementTokenService.issueFromBilling()` mints free-tier temporary tokens on inactive subscription.
- `ServerSafetyInvariantEnforcer.evaluate()` applies protocol safety caps:
    - max events/minute
    - max bytes/minute

### Governance posture

- **Graceful degradation**: billing outages/inactive state reduce capability, not privacy guarantees.
- **Safety-first enforcement**: server checks target abuse ceilings, not room/content semantics.

## 3) Federation boost governance (tier policy + revenue accounting)

### What it governs

- Tiered operational privileges for federation routing behavior.
- Transparent accounting split between platform and homeserver/community infrastructure.
- Abuse throttling distinct from tier bandwidth envelopes.

### Governance controls in code

- `BOOST_TIER_POLICIES` defines per-tier retry priority, relay redundancy, and bandwidth envelope.
- `BoostThrottler.evaluate()` denies over-envelope traffic and abuse spikes.
- `RevenueShareLedger.recordBoostRevenue()` persists gross/platform/homeserver credit splits.
- `buildBoostDashboardSnapshot()` aggregates usage + revenue-share rows by tier.

### Governance posture

- **Transparent economics**: deterministic ledger rows and ratio-based share split.
- **Operational fairness**: tiers get explicit envelopes; abuse cap still applies globally.

## 4) Paid-room creator-key governance

### What it governs

- Payment-gated access to encrypted room key grants.
- Device binding and short-lived grants.
- Key rotation and revocation workflows with measurable SLA tracking.
- Privacy-preserving room discovery defaults.

### Governance controls in code

- `PaidRoomAccessService.verifyAndIssueGrant()` gates grants on payment verification.
- `CreatorKeyLifecycleManager` enforces:
    - bound-device checks,
    - grant expiry,
    - version-based invalidation on key rotation,
    - direct grant revocation.
- `resolvePaidRoomDiscoveryPolicy()` defaults to private and non-directory-listed rooms.
- `evaluateRevocationSla()` computes revocation latency against target thresholds.

### Governance posture

- **Access control discipline**: payment + device binding + lifecycle validity.
- **Incident responsiveness**: explicit, measurable revocation SLA.
- **Privacy default**: paid-room discovery is private unless explicitly relaxed.

## 5) Plugin governance (capabilities, permissions, network guardrails)

### What it governs

- Plugin manifest conformance and declared capability scope.
- Permission lifecycle for background network use.
- Egress controls to prevent unauthorized exfiltration.

### Governance controls in code

- `PluginSandboxRuntime.assertManifestConformance()` enforces required metadata and capability-hook parity.
- Runtime execution (`executeEncode/Decode/Render/Transform`) requires declared capability.
- Permission store models explicit states (`prompt`, `granted`, `denied`) and supports revoke.
- Network policy enforcement:
    - default deny,
    - grant required for `approved_background`,
    - HTTPS-only,
    - strict allowlist of approved origins.

### Governance posture

- **Least privilege by default**.
- **Explicit user/admin mediation for network access**.
- **Runtime guardrails aligned to anti-exfiltration goals**.

## 6) Test-backed governance confidence

Governance controls are directly covered by unit tests:

- `test/unit-tests/steganography/EntitlementManager-test.ts`
- `test/unit-tests/steganography/EntitlementInfrastructure-test.ts`
- `test/unit-tests/steganography/FederationBoosts-test.ts`
- `test/unit-tests/steganography/CreatorKeys-test.ts`
- `test/unit-tests/steganography/PluginSandboxRuntime-test.ts`

## 7) Overall governance maturity snapshot

- **Strongly represented**: policy codification, deterministic deny/allow reasons, auditability, and modular enforcement boundaries.
- **Operationally useful**: includes both control-plane policy (tiers/permissions) and safety-plane caps (abuse/bandwidth/rate).
- **Privacy-aligned**: primary governance data model avoids message plaintext coupling and favors metadata-bucketed observability.
- **Known follow-on**: signed cosmetic pack pipeline is still identified as a remaining item in the phase-6 docs.
