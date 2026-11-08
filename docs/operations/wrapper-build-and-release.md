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

-   `pnpm build` is an **intentional no-op** so the monorepo-wide `turbo run build`
    stays portable (it must not require the Rust/Tauri toolchain on every lane).
    Use **`pnpm bundle`** for actual packaging.
-   Bundles are per-OS: build macOS on macOS, Windows on Windows, Linux on Linux.
-   Auto-update is configured; the updater endpoint in `tauri.conf.json` points at
    `https://github.com/blackmarket-coa/blackout/releases/...`.

**CI / release:** `.github/workflows/blackout-desktop-tauri.yml` is the sole owner
of desktop bundles. Since 2026-11-02 its release jobs run only when a tag is
pushed, and since 2026-11-08 only for a `release-*` tag: there is no branch
trigger and no `workflow_dispatch` (its
toolchain-free notification harness also runs on pull requests to `main`, a branch
that does not exist). It does not run on `v*` tags, which are `release.yml`'s (see
below). Its `create-release` job makes one **draft** GitHub release for the tag, or
reuses the tag's oldest draft, and stops if the tag already has a published
release. Its three build legs (ubuntu-22.04, macos-latest, windows-latest) sign
their bundles with `tauri-action` and upload them, with the updater's
`latest.json`, into that draft. Nothing in CI publishes it. A person does, and only
then can installed desktops see it, because the updater endpoint is
`releases/latest/download/latest.json`. None of this has run yet; until the updater
public key in `tauri.conf.json` (today the literal `${TAURI_UPDATER_PUBKEY}`) and
the Windows certificate thumbprint are set up, the legs stop at updater signing
and at signtool, and the macOS leg stops earlier still, at the certificate import,
while the Apple secrets are unset
(`docs/security/dependency-advisories-server-desktop-2026-10-30.md`, Found outside
scope, items 1 and 6).

To release:

1. Have the secrets in place: `TAURI_SIGNING_PRIVATE_KEY` and its password for
   every leg, `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD` and
   `APPLE_KEYCHAIN_PASSWORD` for the macOS leg (it imports the certificate before
   it builds, and stops there without them), and `WINDOWS_CERTIFICATE` with its
   thumbprint for the Windows leg (the full list is below).
2. Push the tag, for example `git push origin release-<name>` after tagging the
   commit. Tag only a commit that carries this version of
   `blackout-desktop-tauri.yml`: on `develop`, one at or after the merge that
   brought it in (`git show <commit>:.github/workflows/blackout-desktop-tauri.yml`
   has the `create-release` job and the step "Require that the release is still a
   draft"). Do not create the tag from GitHub's release form: publishing from the
   form creates the tag and a published release together, and `create-release`
   then refuses to upload into it. A `v*` tag does not build the desktop.

    GitHub runs a workflow file as it is at the pushed tag's commit, and for a
    dispatch as it is on the dispatched branch (from GitHub's documentation, not
    tried here). So a `release-*` tag on an older commit, a `v*` tag on one whose
    version also takes `v*` (`develop`'s does today), or a dispatch of an older
    branch runs that commit's version, which is set to publish a non-draft release
    that becomes latest, with no person involved; and a `v*` tag on an older commit
    also runs that commit's `release.yml`, which publishes its own release as latest
    at tag time. Today the desktop half stops before it creates a release, because
    every such commit still has the placeholder updater public key: an accident,
    not a control. The `release.yml` half does not stop.

    The workflow runs one run at a time per tag and never cancels a running one: a
    tag moved, or deleted and pushed again, while a run is in flight starts a run
    that waits for the first, then reuses its draft and replaces each leg's files,
    as a re-run does. The workflow sets no `queue` key, so GitHub keeps at most one
    waiting run per tag (its default, `single`): a third push while one run is in
    flight and one waits cancels the waiting run, which had not started (no draft,
    no upload), and the newest run goes ahead once the running one ends.

3. Wait for all three build legs before touching the draft. `create-release`
   checks once, at the start, that the tag has no published release, and each leg
   checks again, as its last step before `tauri-action`, that the release is still
   a draft. `tauri-action` then builds for some minutes and uploads by the draft's
   id without reading its state, so a draft published while a leg builds gets that
   leg's files, `latest.json` included, as a live release. Once a release is
   published, re-running its jobs uploads nothing: a full re-run stops at
   `create-release`, and "Re-run failed jobs", which does not repeat
   `create-release`, stops at each re-run leg's draft check. To rebuild, push a new
   `release-*` tag. GitHub shows a draft only to people with write access to the
   repository (from GitHub's documentation, not tried here); the tag and the run's
   logs are public, because the repository is.
4. Check the draft before publishing:
    - `latest.json` is attached and has `linux-x86_64`, `darwin-aarch64` and
      `windows-x86_64` under `platforms`. There is no Intel macOS
      (`darwin-x86_64`) build: on 2026-11-02 the operator chose not to add one yet.
      Each leg merges its own entry into the one file, and two legs that finish
      together can lose one; if a platform is missing, re-run all jobs for the tag
      (`create-release` reuses the draft, and each leg replaces its own files).
      That remedy works because the draft holds only the desktop's dozen or so
      files: `tauri-action` reads one page of a release's assets (50 when it
      merges `latest.json`, 100 when it replaces its own files), and a release
      with more files than that, such as `release.yml`'s, can hide `latest.json`
      or a leg's own uploads from it. That is why `v*` tags do not build the
      desktop.
    - Every `url` in it names `/releases/download/<this tag>/`, and every
      `signature` is non-empty.
    - The installers are signed (`blackout-desktop/docs/signing-verification.md`).
5. Publish. Leave "Set as the latest release" ticked only if the release carries
   `latest.json`: the updater reads whichever release is latest, and a latest
   release without it makes the endpoint 404, so updates fail closed.

A `v*` tag is `release.yml`'s. At tag time, with no person involved, it builds the
web and mobile artifacts, pushes `ghcr.io/blackmarket-coa/blackout` as `latest`,
`stable` and the tag, signs the image, calls the production deploy webhook and posts
to the Matrix room: the server is deployed when the tag is pushed. Its GitHub
release, which holds the web, mobile, SBOM and signature files and no desktop file,
is a **draft** (since 2026-11-02, pending the operator's yes) that a person
publishes, for a tag on a commit that carries this `release.yml`; on an older
commit it is published at tag time, as latest (step 2). When publishing it, untick
"Set as the latest release": it has no `latest.json`, so making it latest would 404
the desktop updater endpoint until the next desktop release is published.

The app's version is 0.1.0 in `tauri.conf.json`, `Cargo.toml` and `package.json`,
and the tag does not change it. Tauri's updater installs only a higher version, so
a release reaches no installed desktop until the version is raised.

To test a build, dispatch `.github/workflows/blackout-desktop-build-check.yml`
(it also runs on pull requests to `develop` that touch the desktop app): it builds
the same bundles unsigned and uploads nothing. A signed test build means pushing a
`release-*` tag, which makes a draft; to discard it, delete the draft and then the
tag (deleting a draft leaves its tag).

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

-   `android/app/src/main/AndroidManifest.xml` — `matrix`/`blackout` deep-link
    intent filters; `CAMERA`, `RECORD_AUDIO`, `POST_NOTIFICATIONS`, `VIBRATE`.
-   `android/app/build.gradle` — `applicationId co.bmc.blackout`; an **optional**
    release `signingConfig` that activates only when `android/keystore.properties`
    exists, so unsigned release builds still succeed locally/in PR CI.
-   App icons / splash: generate from a 1024px master with `@capacitor/assets`
    (reuse the artwork under `apps/blackout-client/public/res/`). Until a master is
    added the app uses Capacitor's default launcher icons.
-   FCM push needs `android/app/google-services.json` (user-supplied, gitignored;
    see `google-services.json.example`).

**CI / release:**

-   `mobile-native-ci.yml` builds a signed **AAB** and uploads to the Play
    **internal** track on `main` pushes touching `mobile/**` or `blackout-mobile/**`.
-   `blackout-mobile.yml` builds signed AAB + APK on `mobile-release-*` tags.
-   `release.yml` attaches an unsigned APK to the `v*` GitHub release (a draft
    until a person publishes it) as a buildable proof artifact.

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

-   `ios/App/App/Info.plist` — `matrix`/`blackout` URL schemes (`CFBundleURLTypes`);
    `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`,
    `NSPhotoLibraryUsageDescription`; `UIBackgroundModes: remote-notification`.
    (All applied by `scripts/apply-ios-config.sh`.)
-   Push Notifications entitlement (`ios/App/App/App.entitlements`, `aps-environment`)
    — add via Xcode → Signing & Capabilities.
-   App icons / splash via the same `@capacitor/assets` run (`--ios`).

**CI / release:** the macOS jobs in `mobile-native-ci.yml` (internal TestFlight)
and `blackout-mobile.yml` (beta) bootstrap `cap add ios` if the project is absent,
then run `fastlane beta` (`ios/fastlane/Fastfile`) using the App Store Connect API
key secrets. `release.yml` produces an unsigned simulator build as a proof artifact.

## Bundle identifiers

| Surface                                              | Identifier        |
| ---------------------------------------------------- | ----------------- |
| Desktop (`tauri.conf.json`)                          | `co.bmc.blackout` |
| Mobile Android + iOS (`capacitor.config.ts` `appId`) | `co.bmc.blackout` |

Keep `capacitor.config.ts` `appId`, the iOS `Appfile` `app_identifier`, and the
Android `applicationId` in sync — store records and signing profiles are keyed on
the exact id.

## Workflow ownership

| Workflow                     | Trigger                    | Owns                                                                                                                                                                 |
| ---------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blackout-desktop-tauri.yml` | `release-*` tags           | Signed desktop bundles (all OSes) + updater JSON, in a draft release a person publishes                                                                              |
| `mobile-native-ci.yml`       | PR + `main` (mobile paths) | Mobile contract checks; internal-track AAB → Play, IPA → TestFlight                                                                                                  |
| `blackout-mobile.yml`        | `mobile-release-*` tags    | Signed beta/production AAB+APK and TestFlight                                                                                                                        |
| `release.yml`                | `v*` tags                  | Production deploy at tag time (image `latest`/`stable`, deploy webhook, Matrix post); web SBOM, unsigned mobile proof builds and signatures in its own draft release |

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

-   `docs/operations/runbooks/mobile_release_hardening_checklist.md` — signing
    rotation, version/build governance, store metadata, rollout channels.
-   `mobile/docs/release-criteria.md` — staged-rollout gates referenced by the
    `rollout-promotion` job in `mobile-native-ci.yml`.
