# Security Phase 2 App-Layer Hardening (Completed)

This document captures the completed implementation for **Phase 2 (Weeks 3–4)** from `docs/security-resilience-build-plan.md` and records how those controls are applied for this repository's static-web + client-heavy architecture.

## 1) Secure HTTP defaults

Implemented in `docker/nginx-templates/default.conf.template`:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

These headers are emitted with `always` so they are present on normal and error responses.

## 2) Input validation standard for new integrations

Because this repository is primarily a client application (not an API server), "new endpoints" in the build plan are interpreted as:

- module API entrypoints,
- external service adapters,
- and inbound data deserialisation boundaries.

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

- Secure HTTP headers are configured in the default NGINX template.
- A repo-specific validation/authz standard is documented for all new integration boundaries.
- Phase 2 status in `docs/security-resilience-build-plan.md` is marked complete and linked to this record.
