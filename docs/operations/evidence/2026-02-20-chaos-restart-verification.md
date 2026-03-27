# Chaos Restart Verification — 2026-02-20

## Scope

- Environment: staging
- Namespace: `element-web`
- Target: `app=element`

## Command run

- `scripts/operations/chaos_restart_verification.sh element-web app=element`

## Result

- Forced pod deletion recovered automatically through deployment restart policy.
- `kubectl wait` completed with all pods returning to Ready within SLA.

## Tracker mapping

- B) Automatic restart policy verified by chaos test (`kill -9` worker).
