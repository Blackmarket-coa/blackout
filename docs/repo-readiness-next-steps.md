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

Current blocker from baseline execution (latest run in this branch):

- `pnpm lint` and `pnpm test` fail in `@blackout/ui` because `packages/ui/tsconfig.json` references projects that are missing `"composite": true` (`packages/core`, `packages/design`; TS6306).

## Follow-on: cross-doc incomplete-work queue

After the baseline gate passes, use this queue to drive the next implementation slice:

1. **Unfinished code backlog** (`docs/unfinished-code-checklist.md`, prioritized by `docs/unfinished-code-priority-plan.md`).
2. **Self-healing architecture checklist** (`docs/distributed_self_healing_blueprint.md` implementation/security checklists are still open design-to-build tasks).
3. **Privacy-first phase 6 final gap** (`docs/features/privacy-first-phase6/README.md` still has one unchecked item: signed cosmetic pack pipeline).

Treat these as the canonical “what’s next” documents after build gates.

## 1) Environment and local setup

- Confirm the required toolchain is present: Node `>=22.18`, `pnpm` (workspace uses `pnpm@9.x`), and Turbo.
- Install dependencies: `pnpm install --no-frozen-lockfile`.
- Create runtime config by copying `config.sample.json` to `config.json` and setting homeserver/branding values where applicable.

## 2) Resolve remaining QA gate

Current branch status from baseline execution:

- `pnpm lint` ❌ (blocked by `TS6306` in `@blackout/ui` project references).
- `pnpm test` ❌ (blocked by the same `@blackout/ui` build/reference error).
- `pnpm audit --audit-level moderate` ✅ (no known vulnerabilities found).

## 3) Re-run the baseline before merge/deploy

After fixes, run the same baseline used by this repo:

```bash
pnpm install --no-frozen-lockfile
pnpm lint
pnpm test
pnpm audit --audit-level moderate
```

## 4) Triage remaining implementation debt

The unfinished-code scan currently reports a large backlog of `TODO`/`FIXME` markers.
Prioritize this list by user-facing impact and production risk (security, data loss, and message correctness first).

A kickoff triage queue is captured in `docs/qa-triage-start.md`.

## 5) Build and deploy validation

Once quality gates pass:

- Build artifacts with `pnpm build`.
- Validate generated output with real config.
- Smoke-test login, room timeline rendering, media, and steganography send/receive flows.

## 6) Operational recommendation

Treat the repo as functionally close but not yet fully "green" until the `@blackout/ui` TypeScript project-reference blocker is resolved and baseline gates are green.
