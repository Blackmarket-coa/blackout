# Blackout Desktop (Tauri)

This folder packages Blackout as a native desktop app using [Tauri v2](https://tauri.app/).

## Included

- Native window shell for Blackout Web
- System tray support with minimize-to-tray behavior
- Deep-link handling for `matrix://` URIs
- Native notifications via `tauri-plugin-notification`
- Optional autostart support via `tauri-plugin-autostart`
- Single-instance guard via `tauri-plugin-single-instance`
- Auto-updater configuration and GitHub Release publishing workflow

## Icons

Binary icon assets are generated locally (not committed). Source artwork is
`src-tauri/icons/blackout.svg`, and platform-specific PNG/ICO/ICNS files are
produced via `./scripts/generate-icons.sh`.

## Quick start

```bash
./scripts/setup-dev.sh
pnpm dev
```

## Build

To produce real, installable desktop bundles (.dmg/.app, .msi/.nsis, .deb/.rpm/.appimage):

```bash
pnpm bundle
```

Build outputs are produced in `src-tauri/target/release/bundle`. Bundles are
per-OS: build macOS artifacts on macOS, Windows on Windows, Linux on Linux. The
cross-platform release build runs in CI via
`.github/workflows/blackout-desktop-tauri.yml`.

> Note: `pnpm build` is an intentional no-op used to keep the monorepo-wide
> `turbo run build` portable (it does not require the Rust/Tauri toolchain). Use
> `pnpm bundle` for actual packaging.

## Verifying a signed build

Before running a downloaded build, verify the signing chain for your platform
(macOS Gatekeeper/`codesign`, Windows Authenticode, Linux GPG) and the Tauri
auto-updater signature. See [`docs/signing-verification.md`](docs/signing-verification.md).
