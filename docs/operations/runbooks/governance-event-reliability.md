# Governance + DeadDrop Event Reliability Runbook

## Event schema/version contracts

### Governance
- Proposal event type: `co.bmc.proposal`
- Vote event type: `co.bmc.vote`
- Current schema version: `1`
- Backward compatibility:
  - Proposal migration supports legacy `quorum_required`, `ends_at`, `phase` fields.
  - Vote migration supports legacy `proposal_id` field.

### DeadDrop
- Config event type: `co.bmc.deaddrop`
- Queue event type: `co.bmc.deaddrop.queue`
- Command event type: `co.bmc.deaddrop.command`
- Current schema version: `1`
- Backward compatibility:
  - Config migration supports legacy `queue_limit` and `retention_hours` keys.

## Replay-safe/idempotent handling
- Governance vote processing deduplicates duplicate vote events by event ID.
- Effective tallies use latest vote per voter to tolerate out-of-order delivery.
- DeadDrop command sends include `commandId` for idempotent backend processing.

## Admin diagnostics surfaces
- Governance dashboard now shows:
  - invalid proposal events
  - invalid vote events
  - migrated legacy proposal/vote event counts
  - duplicate vote events dropped
- DeadDrop settings now shows:
  - schema version
  - migration flag
  - invalid state event count
  - queue backlog count

## Operator checks
1. Validate governance schema normalization tests:
   - `pnpm --filter @blackout/client exec vitest run tests/unit/features/governance/eventSchemas.test.ts`
2. Validate governance dashboard interaction tests:
   - `pnpm --filter @blackout/client exec vitest run tests/unit/features/governance/GovernanceDashboard.test.tsx`
3. Spot-check room timeline for malformed events and compare with dashboard counters.
4. If malformed/migrated counts spike, open incident and capture samples for migration patch.
