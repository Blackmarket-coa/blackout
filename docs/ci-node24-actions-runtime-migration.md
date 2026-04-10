# CI migration: JavaScript GitHub Actions runtime (Node 20 → Node 24)

## Why this migration was made

GitHub Actions announced JavaScript action runtime migration timelines that make Node 20 usage a near-term CI reliability risk. To avoid forced-runtime regressions, this repository now standardizes on action releases that are compatible with Node 24.

## Decisions

- `actions/checkout` references were upgraded from `@v4` to `v6` (pinned by full commit SHA where used in workflows).
- `actions/upload-artifact` references were upgraded from `@v4` to `v6` (pinned by full commit SHA where used in workflows).
- `pnpm/action-setup` references were upgraded from `@v4` to `@v5`.

## Temporary early-detection guard

A dedicated workflow, `.github/workflows/actions-node24-compat.yml`, was added with:

- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`
- pull-request + manual triggers
- smoke coverage for `checkout`, `pnpm/action-setup`, and `upload-artifact`

This job is intended as a temporary compatibility gate to surface runtime mismatches before GitHub-enforced cutovers.

## Follow-up: remove temporary compatibility flag

After a stable burn-in period with no Node 24 runtime regressions, remove the temporary forcing flag and this dedicated smoke workflow. At that point, compatibility is expected to be guaranteed by default runner behavior and the upgraded action major versions.

## Release notes reviewed

- `actions/checkout` releases: <https://github.com/actions/checkout/releases>
- `actions/upload-artifact` releases: <https://github.com/actions/upload-artifact/releases>
- `pnpm/action-setup` releases: <https://github.com/pnpm/action-setup/releases>
