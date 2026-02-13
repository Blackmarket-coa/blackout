# Security Phase 2 App-Layer Hardening (Completed)

This document captures the completed implementation for **Phase 2 (Weeks 3–4)** from `docs/security-resilience-build-plan.md` and maps those controls to this repository's client-heavy architecture.

## 1) Secure HTTP defaults

For this repository, HTTP hardening is handled at deployment ingress (CDN/reverse proxy), not in application runtime code.

Required deployment baseline for app-shell/static hosting:

- `X-Frame-Options: DENY` (or equivalent via CSP `frame-ancestors 'none'`)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- Explicit CORS allowlist if cross-origin delivery is required
- Rate limiting at edge/proxy for anonymous/public routes

Operator note: avoid `Permissions-Policy` values that disable camera/microphone for Element Web unless intentionally operating in a no-calls environment.

## 2) Input validation standard for new integrations

Because this repository is primarily a client application (not an API server), "new endpoints" in the build plan are interpreted as:

- module API entrypoints,
- external service adapters,
- inbound data deserialization boundaries.

Standard to apply for all new code touching those boundaries:

1. Validate unknown input at the boundary before state mutation.
2. Reject unsafe/invalid payloads early with typed, user-safe errors.
3. Keep validation colocated with data model definitions and include unit tests for invalid cases.

## 3) Consistent least-privilege authz checks

Authorization in this repository depends on Matrix room/account capabilities and feature flags. For new privileged actions:

1. Check permissions before rendering privileged controls.
2. Re-check permissions before dispatching privileged mutations.
3. Fail closed (no-op or user-safe denial state) when capability checks are unavailable.

## Definition of done for Phase 2

- Secure HTTP deployment defaults are documented for the web delivery layer.
- A repo-specific validation/authz standard is documented for all new integration boundaries.
- Phase 2 completion controls are documented in this record for implementation and audit tracking.
