# Marker Budget Policy

Status: Approved (BLK-118)
Owner: Release Manager
Last updated: 2026-03-14

## Goal

Control and steadily reduce incomplete-work marker debt (`TODO`, `FIXME`, `TBD`, `XXX`, `HACK`, `NotImplementedError`, `TODO_test_*`) while preserving developer visibility into legitimate follow-up work.

## Canonical counting rule

Use this exact command for full-repo inventory:

```bash
rg -n "TODO|FIXME|TBD|XXX|HACK|NotImplementedError|TODO_test_" .
```

## Canonical exclusions

Only the following exclusions are permitted for policy reporting:

- `INCOMPLETE_WORK.md`
- `docs/marker_inventory.csv`

No additional ad-hoc team/sprint/path exclusions are allowed.

## Weekly reporting requirements

Every weekly tracker update MUST include:

1. Markers opened (`opened`)
2. Markers closed (`closed`)
3. Net change (`opened - closed`)
4. Trend classification (`up`, `flat`, `down`)
5. Top-10 hotspot ownership table with DRI assignment

## Budget and gates

1. Marker trend must remain **stable or downward** week-over-week.
2. Scope-critical hotspots must have named owner (DRI).
3. New markers in runtime/auth/storage paths must be issue-linked or removed before merge.
4. For any upward net trend, publish corrective action in next sprint plan.

## Ownership and review cadence

- Release Manager: owns policy compliance.
- Tech Lead: assigns hotspot DRIs weekly.
- Program Manager: publishes weekly tracker artifact.

## Exception process

Exceptions are allowed only when:

1. Marker is temporary and tied to an issue ID.
2. Owner and target milestone are recorded inline.
3. Exception is reviewed in weekly tracker.

## Acceptance checklist (BLK-118)

- [x] Canonical scan command documented.
- [x] Canonical exclusion list documented.
- [x] Weekly delta + hotspot ownership requirements documented.
- [x] Signed by Release Manager + Tech Lead.

## Sign-off record (BLK-118)

- **Decision:** Approved
- **Approver roles:** Release Manager, Tech Lead
- **Approval date:** 2026-03-14
- **Evidence:**
  - `docs/blackout_governance_signoff_log.md` (Phase 0 governance controls and approval chain)
  - `docs/project_completion_tracker.md` (completion governance and evidence references)
