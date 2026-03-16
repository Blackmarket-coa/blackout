# Townhall security review signoff checklist

Status: Complete

## Required controls

- [x] Token TTL between 1-5 minutes.
- [x] Membership + role check on every token mint.
- [x] CORS/origin restrictions for widget hosts.
- [x] Endpoint rate-limiting for token/moderation APIs.
- [x] Replay protection and revocation path on downgrade.

## Signoff record

- Security reviewer: Blackout Security Working Group
- Date: 2026-03-16
- Decision: Approved for staged rollout expansion (100 -> 250 -> 500 profile gates).
- Open mitigations:
  - Continue quarterly threat-model refresh for SFU edge exposure.
  - Keep moderation audit-event retention policy aligned with governance requirements.

## Residual risk

- Medium: operational misconfiguration at SFU edge can degrade join reliability.
- Medium: role-policy regressions require continuous integration tests against token endpoint contracts.
