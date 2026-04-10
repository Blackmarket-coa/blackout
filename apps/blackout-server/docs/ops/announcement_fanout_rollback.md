# Announcement Fanout Rollback Runbook (BO-303)

Status: Active
Owner: Federation Lead + SRE/Operations Lead
Last updated: 2026-03-16

## Purpose

Provide rollback-safe federation procedures for announcement channels when fanout policy or sender-role controls show elevated risk.

## Triggers

Execute this rollback when any of the following occur:

- Unauthorized sender broadcast accepted in an announcement room.
- Delayed fanout policy bounds violated by accepted events.
- Federation transaction error rate for announcement channels exceeds SLO threshold.
- Quarantine control cannot contain a policy-leak incident within SLA.

## Preconditions

- Confirm affected room IDs and channel type `blackout_announcement_room`.
- Capture incident timestamp window and event IDs.
- Page on-call Federation + SRE roles.

## Rollback procedure

1. **Freeze fanout expansion**
   - Disable delayed fanout cohorts.
   - Lock rollout toggles for announcement channels.
2. **Quarantine affected rooms/servers**
   - Apply restrictive federation ACL template (`restricted`) to impacted spaces/rooms.
   - Block outbound announcement posting from non-approved peers.
3. **Revert announcement policy event**
   - Replace `m.blackout.announcement.policy` with known-good baseline:
     - `sender_roles`: `announcer`, `moderator`
     - `fanout_mode`: `immediate`
4. **Enforce sender-role gate audit pass**
   - Validate recent events for `blackout_sender_role` compliance.
   - Reject subsequent unauthorized sends.
5. **Validate federation recovery**
   - Confirm transaction success and no new policy-leak events across peers.
6. **Exit quarantine gradually**
   - Return trust tier from `restricted` to prior tier only after two clean validation windows.

## Verification checklist

- [ ] Unauthorized sender attempts are rejected.
- [ ] No delayed fanout events accepted outside policy bounds.
- [ ] Federation success returns to baseline threshold.
- [ ] Quarantine rollback timeline and approvals recorded.

## Evidence artifacts

- Drill report: `docs/reports/staging_drill_report_2026-03-16.md`
- Phase 1 completion report: `docs/reports/phase1_completion_report_2026-03-16.md`
- Go/no-go decision record: `docs/reports/phase2_go_no_go_decision.md`
