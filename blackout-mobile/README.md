# Blackout Mobile

Capacitor wrapper that packages the Blackout web client (`apps/blackout-web`) as a native iOS and Android app.

## How It Works

```
blackout-web (Vite build)  →  dist/  →  Capacitor copies into native WebView
                                    ↓
                           iOS app (Xcode project)
                           Android app (Gradle project)
```

Your existing web frontend runs inside a native shell. Capacitor provides native APIs for push notifications, camera, haptics, deep links, and more via JavaScript bridges.

## Quick Start

```bash
# From this directory:
./scripts/setup-mobile.sh

# Or manually:
pnpm install
pnpm build:web          # builds apps/blackout-web
npx cap add ios         # one-time: generates Xcode project
npx cap add android     # one-time: generates Android Studio project
npx cap sync            # copies web build + native plugins
npx cap open ios        # opens in Xcode → hit Run
npx cap open android    # opens in Android Studio → hit Run
```

## Development with Live Reload

Instead of rebuilding every time you change code:

1. Start the Vite dev server: `cd .. && pnpm web:dev`
2. Find your local IP: `ifconfig | grep "inet " | grep -v 127.0.0.1`
3. Edit `capacitor.config.ts` → uncomment `server.url` and set your IP
4. Run on device: `npx cap run ios` or `npx cap run android`

Changes in the web app will hot-reload on the device.

## Building for Production

```bash
# iOS (requires Mac + Xcode)
pnpm build:ios

# Android
pnpm build:android
```

## Native Features

All wired up in `src/mobile-bootstrap.ts`:

- **Push Notifications** — FCM (Android) + APNs (iOS) via `@capacitor/push-notifications`
- **Deep Links** — handles `matrix://` and `blackout://` URIs
- **Haptic Feedback** — tap feedback on UI interactions
- **Back Button** — Android hardware back, minimizes instead of closing
- **App State** — triggers Matrix re-sync when returning from background
- **Native Share** — share rooms/messages via OS share sheet
- **Camera** — send photos in chat
- **Keyboard** — adjusts layout when software keyboard appears
- **Status Bar** — dark themed, matches app background

## App Store Submission

**iOS:** Requires Apple Developer account ($99/year). Build via Xcode → Archive → Distribute.

**Android:** Requires Google Play Developer account ($25 one-time). Build APK/AAB via Android Studio or `./gradlew bundleRelease`.
