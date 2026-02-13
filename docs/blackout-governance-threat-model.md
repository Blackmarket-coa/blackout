# Blackout governance threat model and abuse cases

## Scope

- Governance proposal lifecycle and voting.
- Delegation graph, revocation, and delegated tally.

## Primary abuse cases

- Delegation spam loops / oscillation attacks.
- Unauthorized proposal transitions by non-members.
- Replay/tamper attempts against proposal records.

## Mitigations in this phase

- Delegation rate limiting and cycle prevention.
- Revocation windows and auditable delegation trail.
- Membership + power-level checks in governance transitions.
- Matrix-state event summaries plus CRDT snapshots for recoverability.
