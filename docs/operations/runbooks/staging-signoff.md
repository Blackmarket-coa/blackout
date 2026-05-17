# Staging Signoff Runbook

How to take a release candidate from "all CI green" to a passing release gate.

The gate enforced by `tools/ci/check-blackout-client-release-gate.mjs` reads
`apps/blackout-client/docs/release/staging-signoff.report.json` and refuses to
let the deploy workflow proceed unless that file records a real SHA, a real
UTC timestamp, zero Sev-1/Sev-2 incidents, no regression flags, three
`manualVerification.*` flags set to `true`, at least one evidence artifact,
and a `signoff.decision` of `GO`.

## 1. Identify the RC SHA and run automated checks

```bash
git checkout claude/<rc-branch>
git rev-parse HEAD                # capture the RC SHA

pnpm install
pnpm ci:smoke:blackout-client
pnpm guard:feature-registry
pnpm guard:legacy-runtime-imports
pnpm guard:cors-allowlist
pnpm guard:db-migrations
pnpm guard:deployment-readiness
pnpm --filter @blackout/client run test:coverage
pnpm lint && pnpm typecheck
```

All of the above must exit `0` before continuing. Save each command's
output as an artifact (or commit a dated evidence file under
`docs/operations/evidence/`).

## 2. Exercise the manual flows on real builds

The three `manualVerification.*` flags require human-in-loop verification on
hardware the cloud sandbox does not have. Do them in this order:

### `desktopLayoutIntegrity` — Tauri desktop

1. `pnpm --dir blackout-desktop dev` (or a real Tauri build on the target
   OS — packaging is stubbed in `package.json:9`).
2. Walk the smoke checklist from `docs/launch-smoke-suite.md` (LS-AUTH-01,
   LS-MSG-01, LS-NAV-01, LS-SETTINGS-01, LS-MEDIA-01).
3. Confirm no spacing/location/functionality regressions vs the previous
   release.

### `mobileLayoutIntegrity` — Capacitor iOS + Android

1. iOS: `pnpm mobile:sync:ios && pnpm mobile:open:ios` on macOS, build and
   run on a real device or simulator.
2. Android: `pnpm mobile:sync:android && pnpm mobile:open:android` with the
   Android SDK + Java 17 installed, build and run on emulator or device.
3. Repeat the smoke checklist on each.

The CI workflows that do the heavy lift live at
`.github/workflows/blackout-mobile.yml` (Android on `ubuntu-22.04`, iOS on
`macos-latest`). You can dispatch them to produce the build artifacts you
verify against.

### `entitlementTransitions` — governance + moderation

1. On a staging deployment, exercise the entitlement transitions in
   `docs/launch-smoke-suite.md` §Governance and §Moderation (LS-GOV-01,
   LS-MOD-01..03).
2. Verify ban behavior, role transitions, and governance event
   finalization. There is no automated harness for these as of 2026-05-17.

## 3. Generate the signoff report

```bash
# From repo root, on the RC commit:
pnpm release:generate-signoff \
  --evidence docs/operations/evidence/staging-signoff-$(date -u +%Y-%m-%d).md \
  --with-manual-verification
```

The `--with-manual-verification` flag flips the three manual flags to
`true`. The generator prints a `WARNING` to stderr — that is intentional;
do not pass the flag unless you actually completed step 2.

Add any other artifacts (CI run URLs, screenshots, recorded test reports)
with `--extra-artifacts a,b,c`. If staging found Sev-3/Sev-4 issues you can
record them with `--sev3 N --sev4 N` — Sev-1/Sev-2 must be zero or the
gate will block.

Override the defaults if needed:

```bash
pnpm release:generate-signoff \
  --build-sha <sha> \
  --executed-at 2026-05-17T18:00:00.000Z \
  --owner alice \
  --decision GO \
  --evidence docs/operations/evidence/staging-signoff-2026-05-17.md \
  --extra-artifacts \
    "tmp/launch-evidence/ci-smoke-blackout-client.log,\
tmp/launch-evidence/guard-feature-registry.log,\
https://github.com/.../actions/runs/12345" \
  --with-manual-verification
```

## 4. Run the release gate

```bash
pnpm guard:blackout-client-release-gate
```

This runs the smoke matrix and boundary guards again, then validates
`apps/blackout-client/docs/release/staging-signoff.report.json`. Expect:

```
Staging signoff OK (apps/blackout-client/docs/release/staging-signoff.report.json): sev1=0, sev2=0, decision=GO.

Blackout client release gate passed.
```

If validation fails, fix the underlying issue rather than editing the report
to make the error go away.

## 5. Commit and open the deploy PR

```bash
git add apps/blackout-client/docs/release/staging-signoff.report.json \
        docs/operations/evidence/staging-signoff-*.md
git commit -m "chore(release): staging signoff for <sha>"
git push -u origin <rc-branch>
```

Open the deploy PR; the release-gate CI job will rerun the gate against
the committed report.

## Schema reference

The generator emits the canonical shape from
`apps/blackout-client/docs/release/staging-signoff.template.json`. The
validator that consumes it is `tools/ci/check-blackout-client-release-gate.mjs`
lines 60–113.
