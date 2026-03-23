# Mobile Application Build Guide

This guide explains how to build and run the mobile application in the current Blackout repository state.

## 1) Choose the right mobile path

There are currently two mobile directories:

- `blackout-mobile/` → **Capacitor-based mobile shell** with iOS/Android tooling scripts (this is the runnable path today).
- `apps/mobile/` → monorepo workspace placeholder package (`@blackout/mobile`) that currently only runs TypeScript checks.

If your goal is to produce installable iOS/Android builds right now, use **`blackout-mobile/`**.

## 2) Prerequisites

Install the following:

- Node.js 22+
- pnpm 9.x
- Xcode (for iOS builds, macOS only)
- Android Studio + Android SDK (for Android builds)

From repository root:

```bash
pnpm install
```

Optional root shortcuts (wired to `blackout-mobile/`):

```bash
pnpm mobile:build
pnpm mobile:dev
pnpm mobile:ios
pnpm mobile:android
```

## 3) Build the web bundle consumed by mobile

The mobile shell packages the web client output from `@blackout/blackout-web`.

```bash
cd blackout-mobile
pnpm build:web
```

## 4) Sync native projects

After building the web bundle, sync assets and Capacitor plugins into native projects:

```bash
pnpm sync
```

If this is your first time setting up native folders:

```bash
pnpm add:ios
pnpm add:android
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
   pnpm sync
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
pnpm sync
```

### Plugin/platform drift after dependency changes

Run:

```bash
pnpm copy
pnpm sync
```

## 8) About `apps/mobile` in the monorepo

`apps/mobile` is present for monorepo structure alignment but is not yet a fully bootstrapped runtime app. Its scripts currently act as placeholder build/lint/test commands.

Until runtime scaffolding is completed there, continue using `blackout-mobile` for real iOS/Android builds.
