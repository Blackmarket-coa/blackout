# Townhall load gates 100/250/500 — execution evidence

Status: Complete (harness-level validation)

## Profiles

- [x] 100 viewers baseline
- [x] 250 viewers scale gate
- [x] 500 viewers launch gate

## Evidence source

- `_port/test/services/blackout/TownhallLoadGate-test.ts`
  - `townhall 100-user load gate`
  - `passes the 250-user load gate in harness budget`
  - `passes the 500-user load gate in harness budget`

## Pass criteria summary

- 100 profile: token mint harness under 1000ms budget.
- 250 profile: token mint harness under 2500ms budget.
- 500 profile: token mint harness under 5000ms budget.

## Notes

These are deterministic harness gates for token issuance throughput, used as release-guard evidence prior to wider staging rollout.
