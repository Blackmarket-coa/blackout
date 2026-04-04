# Mobile/Desktop/Web Parity Check

Date: 2026-04-04

## Scope

This parity check compares platform wrappers against the shared frontend (`apps/blackout-web`) and highlights where behavior is equal vs platform-specific.

## Architecture Baseline

- **Web** is the canonical feature implementation (`@blackout/blackout-web`).
- **Mobile** is a Capacitor shell that builds and embeds the same web bundle from `../apps/blackout-web/dist`.
- **Desktop** is a Tauri shell that runs the same web dev URL and production web bundle from `../../apps/blackout-web/dist`.

## Parity Summary

| Capability area | Web | Mobile | Desktop | Parity status |
|---|---|---|---|---|
| Core chat/governance UI | Native implementation | Shared web bundle | Shared web bundle | ✅ High (same frontend code) |
| Build source of truth | `apps/blackout-web` | Wraps web build via `pnpm --filter @blackout/blackout-web build:web` | Wraps web build via Tauri `beforeBuildCommand` | ✅ High |
| Native deep links | Browser URL handling only | Handles `matrix://` and `blackout://` app URLs | Handles `matrix://` deep links via plugin | ⚠️ Partial mismatch |
| Notifications | Browser notification model | Push notifications (token registration, receive/action listeners) | Native OS notifications via Tauri command/plugin | ⚠️ Different delivery stacks |
| Background/foreground lifecycle | Browser tab semantics | Explicit app-state bridge emits resume-sync events | Window/tray lifecycle with minimize/hide behavior | ⚠️ Platform-specific lifecycle |
| App shell behavior | Browser window/tab | Android back button minimize + haptics + share | System tray toggle, minimize-to-tray, global shortcut | ⚠️ Expected platform divergence |

## Detailed Findings

### 1) Core feature parity is intentionally strong

Both mobile and desktop consume the same `apps/blackout-web` frontend in dev/build flows, so feature parity for chat/governance UX should remain high unless native bridges add overrides.

### 2) Mobile has extra bridge-only capabilities

Mobile initializes a native bridge for deep links, push, app-state, haptics, share sheet, and splash handling. These capabilities do not exist in plain web and are not mirrored one-for-one in desktop.

### 3) Desktop has extra shell-only capabilities

Desktop includes tray menu, unread tooltip counts, global shortcut toggling, minimize-to-tray close interception, native notifications, autostart, updater, and single-instance handling.

### 4) Deep-link parity gap

- Mobile accepts both `matrix://` and `blackout://`.
- Desktop is configured for `matrix` scheme.

If `blackout://` must work on desktop too, add it to Tauri deep-link schemes and wire matching handlers in the web layer.

### 5) Notification parity gap

Notifications are platform-native but implemented differently:

- Mobile: push provider token and action events through Capacitor bridge events.
- Desktop: explicit native notification command exposed by Tauri.
- Web: no equivalent native bridge contract in this repository scope.

## Recommended parity actions

1. Define a single cross-platform **notification contract** in web layer (event names + payload schema), then adapt mobile/desktop bridges to the same contract.
2. Decide whether `blackout://` is required on desktop; if yes, extend desktop scheme registration.
3. Add parity smoke tests that verify shared behavior for:
   - deep-link route resolution
   - unread count updates
   - notification click-to-room navigation
4. Document which differences are **intentional** (native UX) vs **gaps** (missing equivalent behavior).

## Bottom line

- **Functional UI parity:** high, because all platforms ship the same `apps/blackout-web` bundle.
- **Runtime parity:** medium, because mobile and desktop each add different native lifecycle, deep-link, and notification behaviors.
