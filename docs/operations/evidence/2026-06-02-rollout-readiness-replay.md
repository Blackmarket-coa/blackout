# Rollout Readiness Replay — 2026-06-02

Branch: `claude/blackout-rollout-readiness-XyYxF` (HEAD on top of the May/June
feature merges: Barter Board, Migration Hub, Black Market SKUs, fulfillment UI,
vendor trust badges).

## Why this replay

The previous full gate replay was dated 2026-05-12. A wave of feature work merged
afterward (latest commit 2026-06-01), so the documented "Go" no longer covered the
current tree. This replay re-establishes code readiness at current HEAD and records
two deploy-pipeline defects found while validating the production-compose rollout path.

## Code gate results (all pass)

```text
pnpm install --no-frozen-lockfile          # ok (1383 pkgs)
node tools/ci/check-deployment-readiness.mjs  # PASS
pnpm lint                                   # 19/19 tasks
pnpm build                                  # 16/16 tasks
pnpm test                                   # 20/20 tasks
pnpm web:test                               # 1422 passed, 3 skipped (247 files)
pnpm guard:ops-artifacts                    # PASS (4 alerts, 6 dashboards)
pnpm audit --prod --audit-level moderate    # No known vulnerabilities found
pnpm ci:parity                              # PASS
pnpm smoke:aligned                          # PASS
deploy/docker/production/scripts/check-no-latest-images.sh  # PASS
```

## Deploy-pipeline defects found (and fixed in this change)

1. **Build target ≠ run target (fixed).** `release.yml` / `docker.yml` publish to
   `ghcr.io/blackmarket-coa/blackout`, but the production compose stack pulled
   `ghcr.io/blackout/app` — a different org/name, so a published image would never be
   pulled. Aligned `docker-compose.yml` (`app`, `worker`) and `docker-compose.canary.yml`
   (`app_canary`) to `ghcr.io/blackmarket-coa/blackout`, and added a moving `:stable`
   tag to `release.yml` so the compose default `${APP_IMAGE_TAG:-stable}` resolves.

## Open blockers for an actual rollout (NOT resolved by this change)

1. **No image has ever been published.** `release.yml`, `docker.yml`, and
   `deploy-compose-prod.yml` each have 0 runs; no releases/tags exist. A `v*` tag must be
   pushed to build + cosign-sign + publish the image before any canary can pull it.
2. **Build/deploy workflows key on `main`, development lands on `develop`.** Likely why
   the publish workflows never fired. Confirm the release ref before tagging.
3. **Production environment + secrets unverified.** `deploy-compose-prod.yml` needs the
   `production-canary`/`production` GitHub Environments and `PROD_SSH_*` / `POST_DEPLOY_*`
   / `PROD_PUBLIC_URL` secrets, plus a target host with the compose bundle and a recent
   backup/restore (`release-gate-checks.sh`). Must be confirmed by prod ops before deploy.

## Verdict

Code is **Go** at current HEAD. The production-compose canary→promote path is **blocked**
until an image is published (item 1) and the prod environment is confirmed (item 3).
