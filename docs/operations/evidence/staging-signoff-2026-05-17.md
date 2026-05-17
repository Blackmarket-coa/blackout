# Staging Signoff Evidence — 2026-05-17

- **Branch:** `claude/prepare-launch-onY9Q`
- **HEAD SHA:** `c2a2dd0ddbf9bfb726da8e86ecd835bc65f3d943` (`c2a2dd0`)
- **Executed (UTC):** `2026-05-17T01:43:40Z`
- **Environment:** ephemeral cloud container (no macOS, no Android SDK, Tauri build is a scaffold-only stub)

## Automated checks executed

| Check | Command | Result | Log |
| --- | --- | --- | --- |
| Smoke matrix (5 scenarios × 2 modes) | `pnpm ci:smoke:blackout-client` | PASS (10/10) | `tmp/launch-evidence/ci-smoke-blackout-client.log` |
| Feature registry | `pnpm guard:feature-registry` | PASS (16 features, 1 scope) | `tmp/launch-evidence/guard-feature-registry.log` |
| Legacy runtime imports | `pnpm guard:legacy-runtime-imports` | PASS (1,938 files scanned) | `tmp/launch-evidence/guard-legacy-runtime-imports.log` |
| CORS allowlist | `pnpm guard:cors-allowlist` | PASS (175 files scanned) | `tmp/launch-evidence/guard-cors-allowlist.log` |
| DB migrations | `pnpm guard:db-migrations` | PASS (19 migrations; latest `019_obs_ws_passwords`) | `tmp/launch-evidence/guard-db-migrations.log` |
| Deployment readiness | `pnpm guard:deployment-readiness` | PASS (baseline checklist) | `tmp/launch-evidence/guard-deployment-readiness.log` |

`tmp/launch-evidence/` is a transient working-tree directory and is not
committed; in CI, capture each log as a workflow artifact and update the
table to link to those artifact URLs.

## Smoke matrix results

| Scenario | plugin-disabled baseline | full-feature mode |
| --- | --- | --- |
| auth (login/logout/session restore) | PASS | PASS |
| timeline (load/paginate/send/edit/redact/reply/react) | PASS | PASS |
| navigation/layout (home/direct/space switching, right panel toggle) | PASS | PASS |
| settings (theme/notification persistence) | PASS | PASS |
| media/calls (send preview + call setup availability indicators) | PASS | PASS |

## Production-readiness gap register

All 12 BL-PR gaps in `docs/audits/production_readiness_2026_05.md` §3 are recorded as **Closed** at the 2026-05-13 replay (commit `fe4c9ce`). The current HEAD (`c2a2dd0`) is downstream of that replay; no regressions on the closed surface were observed.

## Pending — human-only manual verification

The release gate at `tools/ci/check-blackout-client-release-gate.mjs` (lines 73–77, 102–106) requires three `manualVerification.*` flags to be `true`. They are intentionally left `false` in `apps/blackout-client/docs/release/staging-signoff.report.json` because the underlying checks cannot be honestly attested from this container:

| Flag | Why it can't be set here | Where to verify |
| --- | --- | --- |
| `desktopLayoutIntegrity` | Tauri full build is a scaffold-only stub in `blackout-desktop/package.json:9` ("tauri packaging skipped in monorepo parity"). | Real Tauri build on Linux/macOS/Windows. |
| `mobileLayoutIntegrity` | iOS requires macOS + Xcode; Android requires Android SDK + Java 17. CI gates this on `macos-latest` / `ubuntu-22.04` with Fastlane (see `.github/workflows/blackout-mobile.yml`). | Capacitor builds on both platforms. |
| `entitlementTransitions` | No automated harness; requires exercising governance/moderation flows and presence-based entitlement changes on a staging deployment. | Manual run of the entitlement/governance scenarios in `docs/launch-smoke-suite.md`. |

The release manager flips these to `true` via `pnpm release:generate-signoff --with-manual-verification` once they've exercised the flows — see `docs/operations/runbooks/staging-signoff.md`.

## Tracker mapping

- A) Automated smoke + boundary guards green at HEAD.
- A) Release-gate generator + test installed (`tools/ci/generate-staging-signoff.{mjs,test.mjs}`).
- D) Three `manualVerification.*` flags awaiting human signoff before deploy promotion.
