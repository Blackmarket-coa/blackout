# Repository Readiness: What Still Needs To Be Done

This checklist summarizes the remaining work needed to get the repository into a clean, "ready to ship" state.

## TL;DR: immediate next step

Run the baseline gate sequence for the current monorepo toolchain (`pnpm` + Turbo):

```bash
pnpm install --no-frozen-lockfile
pnpm lint
pnpm test
pnpm audit --audit-level moderate
```

Current baseline status (latest run in this branch):

- `pnpm lint` ✅
- `pnpm test` ✅
- `pnpm audit --audit-level moderate` ✅ (no known vulnerabilities found)

## Follow-on: cross-doc incomplete-work queue

After the baseline gate passes, use this queue to drive the next implementation slice:

1. **Unfinished code backlog** (`docs/unfinished-code-checklist.md`, prioritized by `docs/unfinished-code-priority-plan.md`).
2. **Self-healing architecture checklist** (`docs/distributed_self_healing_blueprint.md` implementation/security checklists are still open design-to-build tasks).
3. **Privacy-first phase 6 validation** (`docs/features/privacy-first-phase6/README.md` is complete; keep regression coverage healthy as follow-on maintenance).

Treat these as the canonical “what’s next” documents after build gates.


## _port recovery: next 10 executable steps

1. Revert the bad `_port` artifact commit (`38fdc64`) on a dedicated recovery branch.
2. Confirm a clean tree immediately after revert with `git status -sb`.
3. Add and keep a local/CI guardrail script (`pnpm guard:port`) that blocks `_port/**` edits except migration metadata docs.
4. Run the guard locally before every baseline run.
5. Wire guard execution into smoke-aligned CI replay (`tools/ci/run-smoke-aligned-checks.mjs`).
6. Wire guard execution into centralized parity replay (`tools/ci/run-centralized-parity.mjs`).
7. Add a PR-range guard step in `.github/workflows/centralized-ci-parity.yml` so PRs touching `_port/**` are evaluated against base branch diff.
8. Keep `_port/**` in the parity workflow trigger paths so guardrails run when `_port` is touched.
9. Re-run monorepo baseline from root (`pnpm lint`, `pnpm test`) after guardrail changes.
10. Continue real migration work only in active workspaces (`packages/*`, `apps/*`) because `_port/` is read-only parked source material.

## 1) Environment and local setup

- Confirm the required toolchain is present: Node `>=22.18`, `pnpm` (workspace uses `pnpm@9.x`), and Turbo.
- Install dependencies: `pnpm install --no-frozen-lockfile`.
- Create runtime config by copying `config.sample.json` to `config.json` and setting homeserver/branding values where applicable.

## 2) Resolve remaining QA gate

Current branch status from baseline execution:

- `pnpm lint` ✅
- `pnpm test` ✅
- `pnpm audit --audit-level moderate` ✅ (no known vulnerabilities found)

## 3) Re-run the baseline before merge/deploy

Before merge/deploy, run:

```bash
pnpm install --no-frozen-lockfile
pnpm lint
pnpm test
pnpm audit --audit-level moderate
```

## 4) Triage remaining implementation debt

The unfinished-code scan currently reports a large backlog of unresolved implementation markers.
Prioritize this list by user-facing impact and production risk (security, data loss, and message correctness first).

A kickoff triage queue is captured in `docs/qa-triage-start.md`.

## 5) Build and deploy validation

Once quality gates pass:

- Build artifacts with `pnpm build`.
- Validate generated output with real config.
- Smoke-test login, room timeline rendering, media, and steganography send/receive flows.

## 6) Operational recommendation

Treat the repo as baseline-green for lint/test/audit. Prioritize the follow-on incomplete-work queue above for implementation progress.
