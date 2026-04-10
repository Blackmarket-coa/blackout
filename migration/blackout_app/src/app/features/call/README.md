# Element Call (SDK mode) integration notes

This folder provides a MatrixRTC + Element Call integration layer for persistent voice/video rooms.

## What is implemented

- `CallProvider.tsx`
    - Initializes MatrixRTC room sessions via `matrix-js-sdk`.
    - Reads LiveKit focus settings from `/.well-known/matrix/client` (`org.matrix.msc4143.rtc_foci` and `rtc_foci` fallback).
    - Exposes focus health status (`healthy`, `degraded`, `unconfigured`) and actionable messaging.
    - Tracks call membership state events for MSC3401 event types (`m.call.member`, `org.matrix.msc3401.call.member`).
- `CallWidget.tsx`
    - Supports SDK mode when `window.ElementCallSdk` is available.
    - Falls back to iframe widget mode when SDK object is unavailable.
    - Uses `postMessage` to sync media state and receive audio-level payloads.
- `VoiceChannel.tsx`
    - Persistent voice-room UI.
    - Click-to-join behavior for call entry.
    - Connected user list with speaking indicators.
    - Mute/deafen/camera/screenshare/device/disconnect controls.
    - Leaves call when the active Matrix room switches.
    - Shows degraded-mode warning copy and keeps widget fallback path non-blocking.

## Infrastructure requirements

For self-hosted MatrixRTC + LiveKit with Element Call:

1. **LiveKit SFU**
    - Docker image: `livekit/livekit-server`.
2. **LiveKit JWT bridge service**
    - Docker image: `ghcr.io/element-hq/lk-jwt-service`.
3. **Matrix well-known configuration**
    - `/.well-known/matrix/client` must expose `rtc_foci` / `org.matrix.msc4143.rtc_foci` with a LiveKit focus.
4. **Network/port forwarding**
    - `7880/TCP`
    - `7881/TCP`
    - `50100-50200/UDP`

## Operational readiness checks

- Config verification: `pnpm guard:call-config`
- Synthetic call probe: `SYNTHETIC_CALL_BASE_URL=https://<staging-domain> pnpm probe:calls:synthetic`
- Incident runbook: `docs/operations/runbooks/call-realtime-incident-and-degraded-mode.md`
