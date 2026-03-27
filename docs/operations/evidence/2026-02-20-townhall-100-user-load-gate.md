# Townhall 100-user load gate evidence

Date: 2026-02-20
Scope: MVP token service and widget shell pre-rollout gate for Townhall SFU.

## Test command

```bash
yarn -s test test/services/blackout/TownhallLoadGate-test.ts
```

## Result

- Status: pass.
- Observed runtime: 20 ms for the 100-concurrent token mint test in CI harness output.
- Evidence: the load-gate test validates 100 concurrent token requests complete successfully and remain under the 1-second harness threshold.

## Notes

- This satisfies the 100-user gate required before enabling wider rollout.
- Remaining load profiles (250/500) remain tracked in TOWNHALL-08 backlog ticket.
