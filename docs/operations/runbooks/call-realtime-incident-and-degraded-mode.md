# Call Realtime Incident + Degraded Mode Runbook

## Scope
MatrixRTC + LiveKit call path for Blackout web/client in staging and production-like environments.

## Required environment checks
1. `/.well-known/matrix/client` exposes `org.matrix.msc4143.rtc_foci` (or `rtc_foci`) with a `livekit` focus.
2. LiveKit SFU endpoint is reachable (`/livekit/sfu` proxy path).
3. LiveKit JWT bridge endpoint responds (`/livekit/jwt/`).
4. Staging compose includes `livekit`, `coturn`, and `redis` with expected port wiring.

## Health checks
- App health: `GET /health` and `GET /health/calls`.
- Config lint: `pnpm guard:call-config`.
- Synthetic probe: `SYNTHETIC_CALL_BASE_URL=<staging-url> pnpm probe:calls:synthetic`.

## Continuous synthetic validation (staging)
Run every 1-5 minutes from your scheduler/monitor:

```bash
SYNTHETIC_CALL_BASE_URL=https://blackout-staging.example.org pnpm probe:calls:synthetic
```

Alert if either condition occurs for 3 consecutive runs:
- probe exits non-zero
- `livekit_sfu` or `livekit_jwt` check has HTTP >= 500

## Degraded mode behavior (user-facing)
When LiveKit focus cannot be resolved or MatrixRTC session startup fails:
- Client must show non-blocking warning copy in call UI.
- Call UI should still permit widget fallback mode.
- User message should include actionable recovery guidance: retry shortly or continue in fallback.

## Incident steps
1. Confirm issue blast radius using synthetic probe output + `/health/calls`.
2. Check reverse-proxy routes (`/livekit/sfu`, `/livekit/jwt`) and upstream service health.
3. Validate LiveKit auth credentials + token service logs.
4. If unresolved within 15 minutes, force degraded mode comms:
   - announce fallback mode in status channel
   - keep calls available via widget fallback
5. Recover and verify:
   - synthetic probe green for 3 consecutive runs
   - `/health/calls` returns configured=true
   - manual join test passes in a staging room

## Operator messaging template
"Calls are currently degraded due to realtime provider instability. You can continue using fallback call mode while we restore full LiveKit-backed quality."
