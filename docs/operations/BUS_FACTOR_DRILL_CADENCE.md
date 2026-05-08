# Bus-Factor Drill Cadence

The bus-factor drill is the test of whether someone handed the runbooks and
the credentials vault could keep BMC running for thirty days without the
maintainer being available. Mandated by
[`AGGRESSIVE_OPERATIONS_GUIDE.md` §7.4](../AGGRESSIVE_OPERATIONS_GUIDE.md);
required as part of the Foundation milestone exit criteria (§5).

## Cadence

- At least one drill during the Foundation milestone. This drill is itself a
  Foundation exit criterion.
- At least one drill per subsequent milestone (Differentiation, Density,
  Infrastructure).
- One additional drill within thirty days of any co-maintainer offboarding,
  per [`CO_MAINTAINER_ONBOARDING.md`](CO_MAINTAINER_ONBOARDING.md).
- Cadence is operationally driven, not calendar-anchored, consistent with the
  guide's posture in §6.4. "Time since last drill" is a watch-item, not a
  hard schedule.

## Drill design

A drill is a scoped, observed exercise where the co-maintainer (or, in the
absence of one, an external trusted operator) executes a Tier-1 operation
end-to-end using only the runbooks and the credentials vault. The maintainer
does not assist; the maintainer observes and times.

Acceptable Tier-1 operations for a single drill iteration include:

- Synapse restart and federation queue recovery, per
  [`infra/single-server-baseline/RUNBOOK.md`](../../infra/single-server-baseline/RUNBOOK.md).
- Cloudflare Tunnel credential rotation, per
  [`../../deploy/docker/production/CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md`](../../deploy/docker/production/CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md).
- Postgres point-in-time restore drill, per
  [`runbooks/postgres_restore_drill.md`](runbooks/postgres_restore_drill.md).
  This is the highest-signal drill for the consolidated Postgres SPOF (row 3
  in [`SPOF_MAP.md`](SPOF_MAP.md)).
- Compat-layer credential recovery for one of the five surfaces, per
  [`../runbooks/COMPAT_LAYER_CREDENTIAL_RECOVERY.md`](../runbooks/COMPAT_LAYER_CREDENTIAL_RECOVERY.md).
- Deaddrop appservice restart, per
  [`../runbooks/DEADDROP_APPSERVICE.md`](../runbooks/DEADDROP_APPSERVICE.md).

Rotate the operation each drill so coverage builds over time; a single drill
that always exercises the same path is not sufficient.

## Drill protocol

- [ ] Pick the operation and confirm a current backup exists for any state
      the drill could touch.
- [ ] Record start timestamp.
- [ ] Hand the co-maintainer the runbook URL and the vault credentials they
      would have under their access rung.
- [ ] Maintainer observes silently. Note every place the runbook is unclear,
      missing, or wrong; do not coach. Coaching invalidates the drill.
- [ ] Record end timestamp and outcome (success / partial / failed).
- [ ] Post-drill: walk through the gaps. The runbook is what gets revised, not
      the operator.

## Recording results

Drill evidence lives under [`evidence/`](evidence/) following the same
convention as
[`runbooks/postgres_restore_drill.md`](runbooks/postgres_restore_drill.md).
Each drill writeup captures:

- date, drill operation, operator, observer
- start / end timestamps and total elapsed
- pass / partial / fail
- enumerated gaps in the runbook
- PR or commit links for runbook revisions that resulted

If the drill fails, the runbook is revised before the milestone is allowed to
exit. A failed drill that produces no runbook revision means the gap was in
the operator, not the runbook; in that case, the co-maintainer onboarding
ladder regresses one rung and re-pairs on the missed step.

## Cross-references

- [`AGGRESSIVE_OPERATIONS_GUIDE.md` §7.4](../AGGRESSIVE_OPERATIONS_GUIDE.md) — drill rationale and cadence
- [`AGGRESSIVE_OPERATIONS_GUIDE.md` §6.4](../AGGRESSIVE_OPERATIONS_GUIDE.md) — milestone-anchored vs calendar-anchored framing
- [`CO_MAINTAINER_ONBOARDING.md`](CO_MAINTAINER_ONBOARDING.md) — drill validates onboarding
- [`SPOF_MAP.md`](SPOF_MAP.md) — drill operations target SPOF mitigations
- [`runbooks/postgres_restore_drill.md`](runbooks/postgres_restore_drill.md) — companion data-side drill
