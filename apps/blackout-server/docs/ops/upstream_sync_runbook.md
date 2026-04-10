# Upstream Sync Runbook

Status: Active
Owner: Core Server Maintainers
Last updated: 2026-03-16

## Purpose

Define repeatable upstream merge hygiene for this Synapse-based fork while preserving Blackout customization boundaries.

## Cadence

- Monthly upstream sync from `element-hq/synapse`.
- Immediate sync on upstream security advisories.

## Procedure

1. Verify `upstream` remote points to `https://github.com/element-hq/synapse.git`.
2. Fetch upstream target branch.
3. Rehearse merge on temporary branch first.
4. Resolve conflicts while preserving `blackout_runtime/` customization boundary.
5. Record any unavoidable non-`blackout_runtime` patch deltas in `PATCHES.md`.
6. Run runtime tests:
   - `pytest -q blackout_runtime_tests`
   - `pytest -q tests/blackout_runtime`
7. Land merge with summary of conflicts and replay notes.

## Required records per sync

- Upstream commit range merged.
- Conflict files and disposition summary.
- Runtime test command results.
- Follow-up remediation tasks (if any).

## Companion reference

- Patch-surface log: `PATCHES.md`
