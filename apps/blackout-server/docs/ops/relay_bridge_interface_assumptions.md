# Relay/Bridge Interface Assumptions (BO-603)

Status: Draft baseline
Owner: Federation Lead + Integration Lead
Updated: 2026-03-16

## Interface assumptions

- Relay/bridge layer provides authenticated transport envelopes.
- Ordering guarantees are best-effort; server remains conflict-safe.
- Duplicate delivery can occur and must be idempotently handled.
- Backpressure signals are propagated to fanout scheduler controls.

## Security assumptions

- Bridge peers are trust-tier classified before federation enablement.
- Sensitive policy events require provenance/audit metadata.

## Compatibility expectations

- Matrix protocol compliance remains default behavior.
- Experimental relay behavior is feature-flagged and disabled by default.
