# Metadata Minimization & Log Redaction

This document describes how Blackout treats personally-identifying and
sensitive metadata in logs and telemetry. It backs the residual-risk
discussion in `THREAT_MODEL.md` §7.

## What we redact

The structured logger (`packages/api/src/telemetry/logger.ts`) walks every
field of every log line and applies the following rules:

| Class | Examples | Behavior |
|-------|----------|----------|
| Secrets | `authorization`, `cookie`, `password`, `recovery`, `*_token`, `*_secret`, `api_key`, `otp` | Replaced with `[REDACTED]` |
| Embedded JWTs in free-text | values matching `eyJ…` | Replaced with `[REDACTED]` |
| PII | `email`, `phone`, `ip`, `x_forwarded_for`, `user_agent` | Pseudonymized in production via salted SHA-256 (`h:<16-base64url>`); kept verbatim in development |
| Identifiers | `matrix_id`, `mxid`, `user_id`, `room_id`, `event_id`, `device_id` | Pseudonymized in production; kept verbatim in development |

Pseudonymization is **deterministic** — the same input maps to the same
opaque output — so logs remain joinable for incident investigation, but
they cannot be casually browsed to learn who-talks-to-whom.

The salt is `LOG_HASH_SALT`. Operators must rotate it whenever a log
archive is shared with a third party so historical pseudonyms are not
re-linkable.

## Operator guidance

- Set `LOG_HASH_SALT` to a high-entropy value in production. **Do not
  reuse** the dev default.
- Logs are emitted as one-line JSON. Pipe through your aggregator of
  choice; a regex-based scrubber is **not** required because redaction
  happens at emission.
- Crash reports and telemetry that go to third parties should pass
  through the same redactor before egress.

## Developer guidance

- Use `log.info(msg, fields)` etc. instead of `console.*`. Fields go in
  the structured object; do not concatenate identifiers into the message
  string.
- If you need to add a new sensitive field name, extend `SECRET_KEY_RE`,
  `PII_KEY_RE`, or `ID_KEY_RE` in `logger.ts` and add a regression test
  in `packages/api/test/logger.integration.test.ts`.
- New endpoints should return only the fields the caller actually needs.
  When in doubt, drop the field.

## What we do *not* hide

We do not currently mask:

- Endpoint paths, HTTP methods, status codes, latencies.
- Coarse counts (request totals, error totals).
- Cluster/process identifiers.

These are operationally necessary and not user-identifying on their own.

## Linked controls

- `THREAT_MODEL.md` §7 R1 — homeserver visibility into who-talks-to-whom.
- `docs/security-resilience-build-plan.md` — Phase 2 hardening.
- `docs/security-phase2-app-hardening.md` — original "data minimization
  in API responses and logs" requirement.
