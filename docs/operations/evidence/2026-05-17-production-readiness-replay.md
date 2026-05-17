# 2026-05-17 production readiness replay

Captures evidence for the readiness verdict at
`docs/audits/production_readiness_check_2026-05-17.md`. Branch
`claude/production-readiness-check-9rxU3`. One fenced block per
command, with a pass/fail summary line.

## Environment

```
Linux 6.18.5 x86_64
node v22.22.2
pnpm 9.15.4
HEAD f8304f7ce817bf4592b5bebb71fe896fd5f0ecc9
```

## pnpm install --no-frozen-lockfile

```
Done in 14.4s (1308 packages resolved, 1308 added)
```

**PASS**

## pnpm audit --prod --audit-level moderate

```
No known vulnerabilities found
```

**PASS**

## Readiness guards (tools/ci/)

```
$ node tools/ci/check-cors-allowlist.mjs
check-cors-allowlist: OK (179 file(s) scanned)

$ node tools/ci/check-db-migrations.mjs
check-db-migrations: OK (19 migration(s); latest 019_obs_ws_passwords)

$ node tools/ci/verify-migrations-ephemeral.mjs
Ephemeral migration verification passed. tables=33 reversible=13

$ node tools/ci/check-ops-artifacts.mjs
Ops artifact checks passed (4 alert files, 6 dashboards).

$ node tools/ci/check-deployment-readiness.mjs
Deployment readiness assertions passed against the Blackout baseline checklist.

$ node tools/ci/check-auth-secrets.mjs
Auth secret hardening check passed.

$ bash deploy/docker/production/scripts/check-no-latest-images.sh
[check-no-latest-images] PASS: no :latest image tags found in production compose files
```

**ALL PASS (7/7 guards)**

## pnpm lint

```
 Tasks:    18 successful, 18 total
 Cached:    0 cached, 18 total
 Time:    17.716s
```

**PASS (18/18 packages)**

## pnpm build

```
 Tasks:    15 successful, 15 total
 Cached:    6 cached, 15 total
 Time:    1m11.531s
```

(Vite bundle-size warnings are pre-existing for the mobile build and
out of scope for this readiness pass.)

**PASS (15/15 packages)**

## pnpm test

```
 Tasks:    19 successful, 19 total
 Cached:    6 cached, 19 total
 Time:    16.858s
```

**PASS (19/19 packages)**

## Signoff regeneration

```
$ pnpm release:generate-signoff -- \
    --evidence docs/operations/evidence/2026-05-17-production-readiness-replay.md \
    --owner release-manager

Wrote signoff report: apps/blackout-client/docs/release/staging-signoff.report.json
  buildSha=f8304f7ce817bf4592b5bebb71fe896fd5f0ecc9
  executedAtUtc=2026-05-17T04:02:30.774Z
  decision=GO sev1=0 sev2=0 manualVerification=false
```

**PASS (report written from current HEAD; manual flags intentionally
false — see release gate output below).**

## Release gate (tools/ci/check-blackout-client-release-gate.mjs)

```
$ node tools/ci/check-blackout-client-release-gate.mjs --skip-smoke --skip-boundary
Release gate staging signoff validation failed for apps/blackout-client/docs/release/staging-signoff.report.json:
- Manual verification "desktopLayoutIntegrity" must be true in staging signoff.
- Manual verification "mobileLayoutIntegrity" must be true in staging signoff.
- Manual verification "entitlementTransitions" must be true in staging signoff.
EXIT=1
```

**FAIL — by design.** The gate refuses to clear release until a human
attests the three manualVerification flags on real Tauri/Capacitor
builds. The remediation is procedural, not code: see
`docs/operations/runbooks/staging-signoff.md`.

## Verdict summary

| Stage | Result |
| --- | --- |
| `pnpm install --no-frozen-lockfile` | PASS |
| `pnpm lint` (18 pkgs) | PASS |
| `pnpm build` (15 pkgs) | PASS |
| `pnpm test` (19 pkgs) | PASS |
| `pnpm audit --prod --audit-level moderate` | PASS |
| 7 readiness guards under `tools/ci/` | PASS (7/7) |
| Staging-signoff report regeneration | WRITTEN @ HEAD f8304f7 |
| Release gate | EXPECTED FAIL — needs human attestation |

