# Evidence — 2026-10-11 removal of the inherited Playwright image-update workflow

Date: 2026-10-11
Branch: `claude/bmc-transmutation-strategy-6jenal-v8`

## Scope

`.github/workflows/playwright-image-updates.yaml` ("Update Playwright docker images", daily
cron `0 6 * * *` plus `workflow_dispatch`) failed on every run. This note records why it was
**removed** rather than repaired. It ran no tests and gated nothing: it pulled
`ghcr.io/element-hq/synapse:develop` and `ghcr.io/element-hq/matrix-authentication-service:main`,
used `sed` to rewrite the `const TAG` line in `playwright/testcontainers/{synapse,mas}.ts` to
the pulled digest, then opened a PR with `secrets.ELEMENT_BOT_TOKEN` that it set to auto-merge
and auto-approved.

## Findings

1. **Inherited from upstream, not written for Blackout.** It was added to element-web by
   `aec15a6ac1` (element-web #12571, 2024-05-30) to keep element-web's Testcontainers homeserver
   pins up to date, and came into this repo with the imported element-web history.
2. **The files it edits no longer exist.** `11bdc096d4` (2026-03-11, phase-1 monorepo scaffold)
   moved `playwright/testcontainers/` to `_port/playwright/testcontainers/`, and `204b6bacdf`
   (2026-05-05) deleted `_port/`. On `develop`, `git ls-files | grep testcontainers` returns nothing.
3. **It has never succeeded here.** All 239 runs (2026-02-14 → 2026-10-10) failed. Their
   check-run annotations show three failure modes:

    - 26 runs, 2026-02-14 → 2026-03-11: `Input 'token' not supplied. Unable to continue.` The
      files still existed then, so the job reached _Create Pull Request_, where
      `ELEMENT_BOT_TOKEN` (an element-hq bot credential) was empty, meaning the secret was not
      set in this repository. `9045721552` reports the same missing secret for the old
      label-sync job, as of 2026-07.
    - 212 runs, 2026-03-12 → 2026-10-10: `Process completed with exit code 2.` For every run
      whose step list GitHub still keeps, the failing step is _Update synapse image_. GNU `sed`
      exits with 2 when it cannot open its input file.
    - 1 run, 2026-05-06: no hosted runner picked up the job.

    The workflow never opened a PR: none has ever come from its `actions/playwright-image-updates`
    branch, and that branch does not exist. This repository also has auto-merge turned off
    (`allow_auto_merge: false`), and the _Enable automerge_ step depends on it.

4. **Nothing in Blackout uses these images for e2e.** No `package.json` or `pnpm-lock.yaml`
   depends on `testcontainers` or `@element-hq/element-web-playwright-common`.
   `playwright.config.ts`, `playwright.navigation-audit.config.ts` and
   `playwright.state-explosion.config.ts` test the built client through `vite preview`.
   `playwright.launch-smoke.config.ts` targets a stack that is already running, set by
   `BLACKOUT_E2E_BASE_URL`. The `nav-audit` job gets a homeserver only from
   `BLACKOUT_E2E_HOMESERVER_URL`, which CI does not set yet (see the TODO in `ci.yml`).
5. **Pointing the workflow at other files was considered and rejected.** The only element-hq
   Synapse/MAS images pinned anywhere in the tree are the release tags in
   `deploy/docker/blackout-backend/docker-compose.yml` (`synapse:v1.130.0`, MAS `v1.15.0`). These
   are deliberate release pins, and that stack's README schedules a monthly review for MAS.
   Aimed there, this updater would auto-merge upstream `develop`/`main` builds into a deploy
   stack without anyone reviewing them.

## Change

-   Deleted `.github/workflows/playwright-image-updates.yaml`.
-   Deleted its two `.github/CODEOWNERS` entries, `/playwright/testcontainers/{synapse,mas}.ts`
    ("Updated by Synapse / MAS image automation"). They listed no owners, so the bot's PRs needed
    no code-owner review. Those paths now fall back to the catch-all owner.

## Reproduction (local, on `develop` at `3fe2ec3`, before the change)

Each step's `run:` block was copied out of the workflow exactly (`yaml.safe_load`) and run under
`bash --noprofile --norc -eo pipefail`, which is the shell GitHub Actions uses:

| Step                 | `docker pull` (succeeded)                                                    | Result                                                                                    |
| -------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Update synapse image | `ghcr.io/element-hq/synapse:develop` → `sha256:bd9a6f1c…`                    | `sed: can't read playwright/testcontainers/synapse.ts: No such file or directory`, exit 2 |
| Update MAS image     | `ghcr.io/element-hq/matrix-authentication-service:main` → `sha256:d543f45d…` | `sed: can't read playwright/testcontainers/mas.ts: No such file or directory`, exit 2     |

`actionlint` 1.7.12 found nothing wrong with the removed file. A linter reads only the file
itself, so it cannot tell that the files the workflow edits and the secret it uses do not exist.

## Follow-up

-   When e2e gets a real homeserver (the `nav-audit` TODO in `ci.yml`), pin its images where that
    service is defined, and if they need automatic updates, write an updater for that file. Do
    not bring this one back.
-   These inherited element-web workflows still depend on Element-only infrastructure and were
    not changed here: `backport.yml` (skips itself when `ELEMENT_BOT_TOKEN` is empty),
    `build_debian.yaml`, `issue_closed.yml`, `release-drafter.yml` and
    `triage-{assigned,incoming,labelled,move-review-requests,unlabelled}.yml`. None of them is
    failing today. `backport.yml` skips, and the rest have never run: issues are disabled on
    this repository, there have been no releases, there is no `staging` branch, and the
    review-request trigger has never fired.
