# Blackout Retention Default and Compliance Note

Date: 2026-03-18  
Owners: Backend Lead + Security Architect

## Default retention decision

Default signaling retention is **72 hours** (`blackout.signal_event_ttl: "72h"`) within the policy window of 24–72 hours.

TTL semantics are anchored to **server receipt time**:
- Local ingress: `self_destruct_after` is computed when event is accepted.
- Federated ingress: if absent, `self_destruct_after` is set on receipt before persistence.

## Compliance rationale

- 72h maximizes recovery margin while still staying inside the approved 24–72h policy envelope.
- Retention remains bounded and aligned with signaling-only data minimization goals.
- Operators can shorten/extend within the policy envelope only with documented approval.

## Required controls

1. TTL-based purge job must run continuously.
2. Purged signaling events must be irretrievable via APIs.
3. Weekly review of purge lag and retained-event growth metrics.
4. Any override from 72h default must be recorded with owner + justification.
