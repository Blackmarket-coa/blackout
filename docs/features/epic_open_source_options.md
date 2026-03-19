# Open-source implementation options for EPIC delivery

_As of 2026-03-19, this shortlist focuses on components that fit Blackout's Matrix + Synapse + E2EE constraints._

## 1) Feature flagging and staged rollout

### Option A: Unleash (self-hosted)
- **What it gives us:** mature feature flag control, gradual rollout strategies, kill switches, audit-friendly workflows.
- **Why it fits:** aligns with Blackout requirement to gate risky EPIC features and support fast rollback.
- **Adoption notes:** start with a single `features.<epic_name>.enabled` flag and cohort targeting (`internal` → `beta` → `general`).

### Option B: Flagsmith (self-hosted)
- **What it gives us:** open-source feature flags + remote config, broad SDK support, environment segmentation.
- **Why it fits:** useful when we need remote config in addition to boolean flags.
- **Adoption notes:** map existing preset bundles to Flagsmith environments or segments.

### Option C: Flipt (+ OpenFeature)
- **What it gives us:** Git-native workflows for flags; OpenFeature compatibility for vendor-neutral SDK usage.
- **Why it fits:** good if we want a portable abstraction and avoid lock-in to one flag provider API.
- **Adoption notes:** use OpenFeature as an app-facing contract and swap providers behind it.

## 2) Permission model and policy enforcement

### Option A: Open Policy Agent (OPA)
- **What it gives us:** policy-as-code with Rego for centralized authorization decisions.
- **Why it fits:** can externalize allow/deny logic from UI code and backend handlers while keeping deterministic policy tests.
- **Adoption notes:** start with read-only decision checks (no enforcement), then enforce after policy parity is proven.

### Option B: Synapse module callbacks (native)
- **What it gives us:** homeserver-level hooks for spam/abuse and authorization-adjacent controls.
- **Why it fits:** keeps policy guardrails close to where Matrix events are accepted/rejected.
- **Adoption notes:** treat module decisions as server-side source of truth; keep client UI in sync with denied reason codes.

## 3) Moderation / abuse controls

### Option: Mjolnir (+ optional Synapse module integration)
- **What it gives us:** established Matrix moderation bot with ban lists, redactions, and anti-spam capabilities.
- **Why it fits:** complements EPIC permission and safety requirements without changing Matrix protocol behavior.
- **Adoption notes:** deploy first in internal spaces; verify interaction with encrypted room policies and audit logs.

## 4) Telemetry and observability

### Option: OpenTelemetry JS
- **What it gives us:** vendor-neutral telemetry API/SDK (metrics/traces/logs) for browser/node stacks.
- **Why it fits:** supports consistent rollout telemetry (`epic_entrypoint_seen`, `epic_action_denied`, etc.) and future backend correlation.
- **Adoption notes:** avoid sensitive payload fields; record reason codes and coarse cohort metadata only.

## 5) Data/event schema validation

### Option: Ajv (JSON Schema)
- **What it gives us:** fast JSON Schema validation in JS/TS for event payloads and migration envelopes.
- **Why it fits:** helps keep schema evolution additive and catches malformed EPIC events before they hit Matrix APIs.
- **Adoption notes:** version schemas with `$id` and `schema_version`; validate in both unit tests and integration fixtures.

## 6) Matrix compatibility and integration testing

### Option: Complement (Matrix compliance suite)
- **What it gives us:** protocol-level integration testing across homeserver/client behaviors.
- **Why it fits:** useful for proving “no Matrix protocol regressions” while EPIC behavior is introduced behind flags.
- **Adoption notes:** gate EPIC rollout to beta only after Complement smoke coverage passes for encrypted-room paths.

## Recommended first implementation slice (low-risk)

1. Add **OpenFeature-compatible flag evaluation** with either Unleash or Flipt backing.
2. Add **Ajv schema checks** for the new EPIC payload envelope.
3. Instrument **OpenTelemetry events** for EPIC entrypoint visibility + deny/success outcomes.
4. Add **Synapse callback checks** (or OPA read-only mode) for permission-denied reason consistency.
5. Expand CI with **Complement smoke jobs** focused on encrypted rooms and power-level edge cases.

This sequence gives immediate rollout control and testability while minimizing E2EE and protocol risk.
