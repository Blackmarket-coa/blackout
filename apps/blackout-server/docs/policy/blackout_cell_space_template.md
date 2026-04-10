# Blackout Cell Space Template (BO-101)

Status: Draft for implementation kickoff
Owner: Policy Lead
Last updated: 2026-03-16

## Purpose

Define the canonical Space hierarchy and default room-policy controls for chapter/cell isolation.

## Space hierarchy

- Root coalition space: `blackout_cell_space`
- Child spaces:
  - `operations`
  - `governance`
  - `logistics`
  - `dispute_resolution`
- Cross-cell links are disabled by default and require explicit approval.

## Baseline policy defaults

- Visibility: private / invite-only.
- Membership:
  - invites limited to trusted roles.
  - least-privilege defaults for new members.
- Federation ACL:
  - trust tier required for federation joins.
  - allowlist/denylist templates applied per tier.

## Required state events

- `m.room.join_rules` with `invite` default.
- `m.room.power_levels` with strict state-event write controls.
- `m.blackout.channel.type` for policy-aware room typing where applicable.

## Validation rules

1. Room creation in cell space must include allowed join rule and power-level profile.
2. Unauthorized event types are rejected based on channel policy bundle.
3. Cross-cell visibility changes require dual approval (Policy + Security).

## Evidence links

- Runtime enforcement: `blackout_runtime/server_semantics.py`
- Unit coverage: `blackout_runtime_tests/test_server_semantics.py`
- Integration coverage: `blackout_runtime_tests/test_module_integration.py`
