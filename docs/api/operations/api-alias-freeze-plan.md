# /api Alias Freeze & Decommission Plan

## Freeze policy

- Freeze date for new `/api/*` consumers: **2026-05-01**.
- After freeze date, no new code paths may introduce `/api/*` usage.
- Canonical namespace remains `/v1/*` for all new integrations.

## Telemetry operations

- Record `/api/*` hits with per-path counters in backend middleware.
- Emit a weekly usage report log with top paths and total calls.
- Review telemetry weekly until legacy usage reaches zero.

## Removal window

- Alias removal target date: **2026-08-31**.
- On/after target date, backend disables `/api/*` mounts and deprecation middleware.

## Exit criteria

- `/api/*` usage is zero for at least two consecutive weekly reports.
- Client/docs examples only reference `/v1/*`.
- Compatibility alias code removed from backend.
