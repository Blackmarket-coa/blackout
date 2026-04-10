# Wave 3 kickoff plan (U5 / U12)

_Date: 2026-03-27_

Status: **complete (implementation + conformance tests landed)**.

This document operationalizes Wave 3 implementation kickoff for:

- U5 — Stego plugin surface
- U12 — Module/runtime extensibility

## U5 — Stego plugin surface

### Scope (kickoff tranche)
- Define plugin metadata contract:
  - `plugin_id`
  - `plugin_version`
  - `capabilities`
  - `signing_key_id`
- Define verification policy:
  - allowlist-only plugin registration
  - signature verification requirement
  - policy-level revocation support

### Security controls
- Reject unsigned plugins and stale signatures.
- Add trust-tier policy for plugin capability classes.
- Emit anomaly events for invalid plugin registration attempts.

### Test minimums
- Contract schema acceptance/rejection tests.
- Signature verification pass/fail tests.
- Revocation and capability-boundary enforcement tests.

## U12 — Module/runtime extensibility

### Scope (kickoff tranche)
- Define extension contract for runtime modules:
  - capability negotiation payload
  - contract version handshake
  - compatibility matrix checks
- Introduce config-gated extension loading policy:
  - `blackout_enable_runtime_extensions`

### Safety controls
- Deny incompatible contract versions.
- Enforce capability allowlist before activation.
- Require startup-time compatibility validation with explicit failure reasons.

### Test minimums
- Capability negotiation acceptance/rejection tests.
- Contract-version compatibility tests.
- Extension activation and deny-path integration tests.

## Rollout sequence

1. Contract/spec freeze by **2026-04-20**
2. Prototype implementation behind config gates by **2026-05-01**
3. Compatibility/security hardening by **2026-05-10**
4. Release-candidate evidence gate by **2026-05-15**

## Exit criteria

- Extension/plugin contracts are versioned and documented.
- Signature/trust and capability-boundary checks are enforced in runtime paths.
- Compatibility and conformance tests are linked in the upstream support matrix.

## Implementation evidence (2026-03-27)

- U5 plugin registration enforcement (allowlist, signature verification, key revocation, capability trust-boundary checks): `blackout_runtime/module.py` + `blackout_runtime_tests/test_module_integration.py`.
- U12 runtime extensibility contract enforcement (config gate, contract-version handshake, capability negotiation/deny paths): `blackout_runtime/module.py` + `blackout_runtime_tests/test_module_integration.py`.
