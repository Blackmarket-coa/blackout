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

1. **Image namespace mismatch (fixed).** `release.yml` / `docker.yml` publish to
   `ghcr.io/blackmarket-coa/blackout`, but the production compose stack pulled
   `ghcr.io/blackout/app` — a different org/name, so a published image would never be
   pulled. Aligned `docker-compose.yml` (`app`, `worker`) and `docker-compose.canary.yml`
   (`app_canary`) to `ghcr.io/blackmarket-coa/blackout`, and added a moving `:stable`
   tag to `release.yml` so the compose default `${APP_IMAGE_TAG:-stable}` resolves.

2. **Published image was the wrong artifact (fixed).** The `blackout` image was built
   from `deploy/docker/Dockerfile` — an **nginx static-web** image — but the compose
   `app`/`worker` services run `./bin/migrate && ./bin/start-app` / `./bin/start-worker`,
   entrypoints that do not exist in a web image, so the fleet would exit immediately and
   never go healthy (raised as P1 on PR #791). The canonical `blackout` image is now the
   **backend API runtime** built from `apps/blackout-server/Dockerfile` (release.yml +
   docker.yml); the static web client moved to the separate `blackout-web` image.

3. **Missing entrypoints + credential bridging (fixed).** Added
   `deploy/docker/backend/bin/{migrate,start-app,start-worker,worker-healthcheck}` plus
   `_entrypoint-env.sh`, which assembles `DATABASE_URL` (+ `BLACKOUT_DB_MODE=postgres`)
   and a credentialed `REDIS_URL` from the compose `DB_*`/`CACHE_*` vars and the
   `*_PASSWORD_FILE` docker secrets the app reads.

4. **No worker process (fixed).** The API's periodic loops (scheduled-message dispatcher,
   FBM sweepers, ACL reconcile) were extracted to `packages/api/src/backgroundLoops.ts`
   and given a dedicated `packages/api/src/worker.ts` entrypoint (`pnpm … worker`). The
   `app`/`app_canary` replicas set `BLACKOUT_BACKGROUND_WORKERS_DISABLED=1` so jobs run
   once, in the `worker` service; liveness is a heartbeat checked by `worker-healthcheck`.

5. **Image port (fixed).** `apps/blackout-server/Dockerfile` exposed 3001 while the app
   listens on `PORT` (default 3000) and the compose healthchecks probe 3000; corrected to
   `EXPOSE 3000` and `CMD ["./bin/start-app"]`.

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
