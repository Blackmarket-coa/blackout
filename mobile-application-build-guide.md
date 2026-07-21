# Mobile Application Build Guide

This guide explains how to build and run the mobile application in the current Blackout repository state.

## 1) Choose the right mobile path

Mobile builds are handled by:

-   `blackout-mobile/` → **Capacitor-based mobile shell** with iOS/Android tooling scripts.

Use **`blackout-mobile/`** for installable iOS/Android builds.

## 2) Prerequisites

Install the following:

-   Node.js 22+
-   pnpm 9.x
-   Xcode (for iOS builds, macOS only)
-   Android Studio + Android SDK (for Android builds)

From repository root:

```bash
pnpm install
```

Optional root shortcuts (wired to `blackout-mobile/`):

```bash
pnpm mobile:build
pnpm mobile:dev
pnpm mobile:sync:android
pnpm mobile:sync:ios
pnpm mobile:open:ios
pnpm mobile:open:android
```

## 3) Build the web bundle consumed by mobile

The mobile shell packages the web client output from `@blackout/client` (`apps/blackout-client`).

```bash
cd blackout-mobile
pnpm build:web
```

## 4) Sync native projects

After building the web bundle, sync assets and Capacitor plugins into native projects:

```bash
pnpm sync:android
pnpm sync:ios
```

If this is your first time setting up native folders:

```bash
pnpm add:ios
pnpm add:android
```

### Camera recording permissions (@capgo/camera-preview)

The video composer's hold-to-record surface uses `@capgo/camera-preview`.
The Android manifest in this repo already declares `CAMERA`,
`RECORD_AUDIO`, and `MODIFY_AUDIO_SETTINGS`. The iOS project is generated
(`pnpm add:ios`), so after generating it add the usage strings to
`ios/App/App/Info.plist` or recording will crash at runtime:

```xml
<key>NSCameraUsageDescription</key>
<string>Record video stories</string>
<key>NSMicrophoneUsageDescription</key>
<string>Record audio with video stories</string>
```

## 5) Run and iterate

Open each native project in its platform IDE:

```bash
pnpm open:ios
pnpm open:android
```

Then run from Xcode/Android Studio using your preferred simulator or physical device.

## 6) Typical development loop

1. Make UI/feature changes in web app packages.
2. Rebuild mobile web bundle:
    ```bash
    pnpm build:web
    ```
3. Sync into native projects:
    ```bash
    pnpm sync:android   # on Android flow
    pnpm sync:ios       # on iOS flow
    ```
4. Re-run from Xcode/Android Studio.

## 7) Troubleshooting

### “No native project found”

Run:

```bash
pnpm add:ios
pnpm add:android
```

### “Web changes are not visible in app”

Ensure you rerun:

```bash
pnpm build:web
pnpm sync:android   # or pnpm sync:ios
```

### Plugin/platform drift after dependency changes

Run:

```bash
pnpm copy
pnpm sync:android   # or pnpm sync:ios
```

## 8) Canonical mobile path

`blackout-mobile` is the canonical and supported mobile path in this repository for native app packaging.

For release hardening and production distribution policy, follow:

-   `docs/operations/runbooks/mobile_release_hardening_checklist.md`
