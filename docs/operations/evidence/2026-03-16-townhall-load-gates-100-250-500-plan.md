# Townhall load gates 100/250/500 — execution plan

Status: In progress

## Planned profiles

- 100 viewers baseline
- 250 viewers scale gate
- 500 viewers launch gate

## Evidence template

For each profile capture:

- environment + build revision
- join latency (p50/p95)
- publisher/subscriber health
- packet-loss/rebuffer stats
- pass/fail decision and follow-up actions

## Next action

Run staged load tests and append measured results to this evidence file before rollout expansion.
