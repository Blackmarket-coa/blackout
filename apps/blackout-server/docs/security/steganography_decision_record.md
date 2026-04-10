# Security Decision Record: Steganography Scope (BO-501)

Date: 2026-03-16
Status: Approved baseline
Owner: Security Lead

## Decision

Server-side steganography tooling remains out of scope. Blackout server will not add covert payload encode/decode features in media pipelines.

## Rationale

- Avoids introducing hard-to-audit covert channels at server layer.
- Preserves compatibility and predictable media processing behavior.
- Keeps abuse and compliance boundaries enforceable in server operations.

## In-scope controls

- Media integrity verification and format validation.
- Standard encryption and transport security.
- Abuse-monitoring hooks and rate controls around media ingestion paths.

## Follow-up

- Maintain this decision unless superseded by formal Security + Governance approval.
