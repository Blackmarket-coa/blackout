# Evidence — 2026-03-16 centralized CI parity + smoke runner remediation

Date: 2026-03-16
Branch: `work`
Verifier: Codex (GPT-5.2-Codex)

## Scope

This evidence bundle closes two residual release-gate risks:

1. hosted canonical CI parity confirmation,
2. `_port` smoke-runner mismatch risk for deploy-critical validation.

## Changes delivered

- Added a canonical parity pipeline entrypoint: `pnpm ci:parity` (`tools/ci/run-centralized-parity.mjs`).
- Added a supported smoke-aligned runner entrypoint: `pnpm smoke:aligned` (`tools/ci/run-smoke-aligned-checks.mjs`).
- Added hosted workflow parity replay: `.github/workflows/centralized-ci-parity.yml`.

## Commands and outcomes

1. `pnpm smoke:aligned`
   - Exit code: `0`
   - Result summary:
     - `pnpm test` passes across all workspace packages.
     - `pnpm --filter @blackout/web build` passes.

2. `pnpm ci:parity`
   - Exit code: `0`
   - Result summary:
     - `pnpm lint` passes.
     - `pnpm test` passes.
     - `pnpm build` passes.
     - `pnpm audit --audit-level high` reports no known vulnerabilities.
     - `node _port/scripts/operations/docs_integrity_check.cjs` passes.
     - `node tools/ci/run-smoke-aligned-checks.mjs` passes.

## Risk disposition

- Hosted CI parity risk: **Mitigated** with a dedicated hosted parity workflow invoking canonical `pnpm ci:parity`.
- `_port` smoke-runner mismatch risk: **Mitigated** by migrating release smoke gating to a supported monorepo runner (`pnpm smoke:aligned`) used both locally and in parity replay.

## Follow-up

- Continue P2 marker burn-down from `docs/unfinished-code-checklist.md`.
- Keep monthly docs integrity checks in the canonical parity pipeline.
