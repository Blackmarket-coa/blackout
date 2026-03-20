# Blackout Mobile (Capacitor)

This is the **Option A** mobile path: wrap the existing Blackout web app with Capacitor for iOS + Android delivery.

## Why this approach

- Fastest sprint timeline.
- Reuses most existing web code.
- Native plugin access for push notifications, camera, filesystem, sharing, haptics, and app lifecycle events.

## Included plugins

- `@capacitor/push-notifications`
- `@capacitor/camera`
- `@capacitor/filesystem`
- `@capacitor/share`
- `@capacitor/haptics`
- `@capacitor/app`

## Quick start

```bash
cd blackout-mobile
./scripts/setup-mobile.sh
```

## Manual project creation commands

```bash
npx cap add ios
npx cap add android
```

## Build and sync

```bash
pnpm sync
npx cap open ios
npx cap open android
```

See `docs/push-notifications.md` and `docs/mobile-ui-patterns.md` for implementation details.
