# Desktop & Mobile Wrapper: Build and Release

How Blackout is packaged as native **desktop** (Tauri) and **mobile** (Capacitor)
apps, how to build them, and which CI workflow owns each artifact.

Both wrappers embed the **same** web client — `@blackout/client` at
`apps/blackout-client`, built with Vite to `apps/blackout-client/dist/`. Nothing
about the apps is a rewrite; they wrap the production web build in a native shell
and add native capabilities (tray, deep links, push, camera, haptics, …).

```
@blackout/client  →  apps/blackout-client/dist/  ──┬─→  Tauri (blackout-desktop)   → .dmg/.msi/.deb/.appimage
                                                   └─→  Capacitor (blackout-mobile) → .aab/.apk (Android), .ipa (iOS)
```

> Mobile note: there is also a separate Expo/React-Native scaffold at
> `packages/mobile/`. That is an independent native-rewrite track and is **not**
> the path used here. The canonical "turn the web app into a mobile app" wrapper
> is `blackout-mobile/` (Capacitor). The `mobile/` package (`@blackout/mobile`)
> is shared TypeScript bridge contracts consumed by clients.

## 0. Foundation — build the web bundle first

Everything downstream embeds `apps/blackout-client/dist/`.

```bash
pnpm install
pnpm --filter @blackout/client build   # → apps/blackout-client/dist/
```

This is the exact command both `blackout-desktop/src-tauri/tauri.conf.json`
(`beforeBuildCommand`) and `blackout-mobile` (`build:web`) call automatically, so
you rarely run it by hand — but if a packaged app shows a blank screen, build the
web bundle and load it directly first. Asset base path is `/` (set in
`apps/blackout-client/build.config.ts`); if packaged shells 404 their assets,
switch it to `./`.

## 1. Desktop (Tauri)

Bundle identifier: `co.bmc.blackout`. Source: `blackout-desktop/`.

```bash
cd blackout-desktop
./scripts/setup-dev.sh   # one-time: Rust + platform libs (see script for the apt list)
pnpm dev                 # run the app against the Vite dev server
pnpm bundle              # produce real installers → src-tauri/target/release/bundle
```

- `pnpm build` is an **intentional no-op** so the monorepo-wide `turbo run build`
  stays portable (it must not require the Rust/Tauri toolchain on every lane).
  Use **`pnpm bundle`** for actual packaging.
- Bundles are per-OS: build macOS on macOS, Windows on Windows, Linux on Linux.
- Auto-update is configured; the updater endpoint in `tauri.conf.json` points at
  `https://github.com/blackmarket-coa/blackout/releases/...`.

**CI / release:** `.github/workflows/blackout-desktop-tauri.yml` is the sole owner
of desktop bundles. It builds + signs all three OSes via `tauri-action`, attaches
installers and the updater JSON to the release, and triggers on `main`,
`release-*`, and `v*` tags.

## 2. Mobile Android (Capacitor)

The native Gradle project lives at `blackout-mobile/android/` and is committed
(generate-and-commit). If it is ever missing, regenerate it:

```bash
cd blackout-mobile
pnpm install
pnpm build:web        # ensure apps/blackout-client/dist exists
pnpm add:android      # one-time: generates the Gradle project (cap add android)
pnpm sync:android     # copy web bundle + plugins into the native project
pnpm open:android     # open in Android Studio, or:
cd android && ./gradlew assembleDebug   # unsigned debug APK (needs Android SDK)
```

Native customizations applied in the committed project:
- `android/app/src/main/AndroidManifest.xml` — `matrix`/`blackout` deep-link
  intent filters; `CAMERA`, `RECORD_AUDIO`, `POST_NOTIFICATIONS`, `VIBRATE`.
- `android/app/build.gradle` — `applicationId co.bmc.blackout`; an **optional**
  release `signingConfig` that activates only when `android/keystore.properties`
  exists, so unsigned release builds still succeed locally/in PR CI.
- App icons / splash: generate from a 1024px master with `@capacitor/assets`
  (reuse the artwork under `apps/blackout-client/public/res/`). Until a master is
  added the app uses Capacitor's default launcher icons.
- FCM push needs `android/app/google-services.json` (user-supplied, gitignored;
  see `google-services.json.example`).

**CI / release:**
- `mobile-native-ci.yml` builds a signed **AAB** and uploads to the Play
  **internal** track on `main` pushes touching `mobile/**` or `blackout-mobile/**`.
- `blackout-mobile.yml` builds signed AAB + APK on `mobile-release-*` tags.
- `release.yml` attaches an unsigned APK to the `v*` GitHub release as a
  buildable proof artifact.

Release signing reads `ANDROID_UPLOAD_KEYSTORE_B64` (+ password/alias secrets),
which CI decodes into a keystore and a generated `android/keystore.properties`.

## 3. Mobile iOS (Capacitor)

**iOS cannot be generated or built on Linux** — it requires macOS + Xcode +
CocoaPods. The Xcode project is generated on a Mac or on the macOS CI runner.

One-time, on a Mac:

```bash
cd blackout-mobile
pnpm build:web
pnpm add:ios                  # generates ios/App/App.xcworkspace (cap add ios)
pnpm sync:ios
./scripts/apply-ios-config.sh # applies Info.plist deep links + permissions (idempotent, macOS-only)
pnpm open:ios                 # open in Xcode → Signing & Capabilities, then Run/Archive
```

`cap add ios` writes into `ios/App/`, leaving the existing `ios/fastlane/` lanes
intact. `scripts/apply-ios-config.sh` applies most native config automatically;
review and commit the result. Customizations (commit them after generation):
- `ios/App/App/Info.plist` — `matrix`/`blackout` URL schemes (`CFBundleURLTypes`);
  `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`,
  `NSPhotoLibraryUsageDescription`; `UIBackgroundModes: remote-notification`.
  (All applied by `scripts/apply-ios-config.sh`.)
- Push Notifications entitlement (`ios/App/App/App.entitlements`, `aps-environment`)
  — add via Xcode → Signing & Capabilities.
- App icons / splash via the same `@capacitor/assets` run (`--ios`).

**CI / release:** the macOS jobs in `mobile-native-ci.yml` (internal TestFlight)
and `blackout-mobile.yml` (beta) bootstrap `cap add ios` if the project is absent,
then run `fastlane beta` (`ios/fastlane/Fastfile`) using the App Store Connect API
key secrets. `release.yml` produces an unsigned simulator build as a proof artifact.

## Bundle identifiers

| Surface | Identifier |
|---|---|
| Desktop (`tauri.conf.json`) | `co.bmc.blackout` |
| Mobile Android + iOS (`capacitor.config.ts` `appId`) | `co.bmc.blackout` |

Keep `capacitor.config.ts` `appId`, the iOS `Appfile` `app_identifier`, and the
Android `applicationId` in sync — store records and signing profiles are keyed on
the exact id.

## Workflow ownership

| Workflow | Trigger | Owns |
|---|---|---|
| `blackout-desktop-tauri.yml` | `main`, `release-*`, `v*` | Signed desktop bundles (all OSes) + updater JSON |
| `mobile-native-ci.yml` | PR + `main` (mobile paths) | Mobile contract checks; internal-track AAB → Play, IPA → TestFlight |
| `blackout-mobile.yml` | `mobile-release-*` tags | Signed beta/production AAB+APK and TestFlight |
| `release.yml` | `v*` tags | Web SBOM artifact, Docker image, GitHub release aggregation, unsigned mobile proof builds |

## Credentials the maintainer must supply (secrets)

These are never committed; CI references them by name.

**Desktop:** `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`,
`TAURI_UPDATER_PUBKEY` (updater keypair via `tauri signer generate`);
`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_KEYCHAIN_PASSWORD`,
`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` (macOS Developer ID + notarization);
`WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_THUMBPRINT`.

**Android:** `ANDROID_UPLOAD_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` (upload keystore);
`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (Play uploads); `google-services.json` (FCM).

**iOS:** Apple Developer account; distribution cert/profile (or fastlane match +
`MATCH_PASSWORD`); `APP_STORE_CONNECT_API_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`,
`APP_STORE_CONNECT_API_KEY_CONTENT`; an App Store record for `co.bmc.blackout`.

## Related runbooks

- `docs/operations/runbooks/mobile_release_hardening_checklist.md` — signing
  rotation, version/build governance, store metadata, rollout channels.
- `mobile/docs/release-criteria.md` — staged-rollout gates referenced by the
  `rollout-promotion` job in `mobile-native-ci.yml`.
