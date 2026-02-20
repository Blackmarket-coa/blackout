# On-Call Escalation Tree

## Primary rotation

- **Operator A (SRE-primary)**
- **Operator B (Platform-primary backup)**

## Escalation sequence

1. Primary acknowledges page within 5 minutes.
2. If unacknowledged, auto-escalate to secondary at 5 minutes.
3. If unresolved after 15 minutes, page Incident Commander.
4. If security-impacting, immediately include Security On-Call.

## Independence requirement

At least two independent operators from different teams must be available in each weekly rotation window.
