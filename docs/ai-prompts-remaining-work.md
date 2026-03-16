# Blackout Deployment-Readiness — AI Prompt Pack

This document provides copy/paste AI prompts focused on the remaining work to get this repository to a **deployment-ready, evidence-backed** state.

## Source trackers used

- `docs/repo-readiness-next-steps.md` (baseline gate sequence).
- `docs/rollout-readiness-status.md` (work-order and go/no-go evidence model).
- `docs/blackout_centralized_release_readiness_gate.md` (residual risk register and sign-off).
- `docs/project_completion_tracker.md` (post-rollout backlog + readiness criterion).
- `docs/unfinished-code-checklist.md` (open marker inventory: 54).

## Prompt usage contract

For each prompt below, require the agent to:

1. Make concrete, reviewable changes (no placeholder text).
2. Run the exact commands listed in the prompt and report pass/fail clearly.
3. Update impacted docs/evidence links in the same PR when status claims change.
4. Keep tracker metadata synchronized (owner, status, remaining work, next review date).
5. Include rollback notes for any risky operational or config change.

---

## Prompt 1 — Baseline quality gate replay (must-pass)

```text
Run the repo baseline gate sequence and produce a single evidence note for the current branch head.

Commands:
- pnpm install --no-frozen-lockfile
- pnpm lint
- pnpm test
- pnpm audit --audit-level moderate

Tasks:
- Capture exact command outputs and exit codes.
- If any gate fails, fix forward in the same PR (code/tests/docs as needed).
- Add or update an evidence file under docs/operations/evidence/ with date, branch, commit SHA, and outputs.
- Update docs/rollout-readiness-status.md baseline evidence section if command reality changed.

Done when:
- All four commands pass on branch head.
- Evidence artifact is linked from readiness docs.
```

## Prompt 2 — Production build + artifact sanity verification

```text
Validate production artifact generation and runtime config assumptions.

Commands:
- pnpm build
- (if applicable in this repo) pnpm dist

Tasks:
- Verify build output paths and expected files exist.
- Validate config-loading assumptions using config.sample.json -> config.json flow.
- Document any environment-specific constraints (e.g., CI-only packaging steps).
- Add/update evidence file with artifact names, checksums/sizes, and command outputs.

Done when:
- Build commands pass and artifact outputs are documented.
- Release docs reference current artifact evidence.
```

## Prompt 3 — Smoke coverage for deploy-critical user flows

```text
Create or run focused smoke validation for deploy-critical behaviors:
- login/auth bootstrap,
- room/timeline rendering,
- media send/render path,
- steganography path (send/receive) if feature-flagged in scope.

Tasks:
- Prefer existing test suites first; add narrowly scoped tests only for uncovered critical regressions.
- Report exact command(s) used and pass/fail results.
- Record unresolved gaps as explicit residual risks with owner/date.
- Update rollout readiness docs with smoke scope and current result.

Done when:
- Critical smoke scenarios are either passing with evidence, or bounded by explicit risk entries.
```

## Prompt 4 — Residual dependency/security risk disposition refresh

```text
Re-run dependency/security checks and reconcile disposition docs.

Commands:
- pnpm audit --audit-level moderate

Tasks:
- If audit passes cleanly, remove stale risk-acceptance language that implies unresolved findings.
- If findings remain, update risk-acceptance doc with advisory IDs, compensating controls, owner, expiry/review date.
- Ensure rollout and release-gate docs reflect current truth (no contradictory claims).

Done when:
- Security posture statements in docs match current audit output.
- Any residual risk has explicit ownership and review cadence.
```

## Prompt 5 — P2 debt burn-down with behavior-preserving fixes

```text
Execute a real P2 debt burn-down batch from docs/unfinished-code-checklist.md.

Rules:
- Do not close markers by comment-only rewording.
- Each closed marker must include a concrete behavior/code improvement OR a test-backed refactor.
- Keep PR size reviewable (target 3-8 markers per PR).

Tasks:
- Pick the next highest-leverage P2 markers.
- Implement code and test updates per marker.
- Remove/resolve markers only when implementation is complete.
- Synchronize marker counts across linked docs and run docs integrity check.

Validation commands:
- pnpm lint
- pnpm test <targeted suites>
- node _port/scripts/operations/docs_integrity_check.cjs

Done when:
- Closed markers have corresponding code/test diffs.
- Tracker counts and evidence links are synchronized.
```

## Prompt 6 — Centralized CI replay for release promotion

```text
Run a canonical CI replay and attach authoritative links.

Tasks:
- Execute lint/test/build/audit pipeline in hosted CI.
- Archive CI run URL, artifact references, and commit SHA.
- Compare local vs hosted results and document any drift.
- Update docs/blackout_centralized_release_readiness_gate.md risk register accordingly.

Done when:
- Hosted CI evidence is linked in release-gate doc.
- CI drift risk is closed or bounded with owner/date.
```

## Prompt 7 — Release-governance sign-off completion

```text
Finalize go/no-go decision blocks for deployment.

Tasks:
- Gather sign-offs (Release, Security, Platform/Infra, Product/Governance as required).
- Record decision, owner, date, and decision basis in release gate doc.
- Ensure recommendation text is explicit and backed by linked evidence.

Done when:
- Sign-off table is complete and current.
- Gate artifact is directly usable in deployment review.
```

---

## Recommended execution order

1. Prompt 1 (baseline gates).
2. Prompt 2 (build/artifacts).
3. Prompt 3 (smoke-critical flows).
4. Prompt 4 (security disposition refresh).
5. Prompt 5 (real P2 burn-down in small batches).
6. Prompt 6 (hosted CI replay).
7. Prompt 7 (final sign-off).

## Verification

- Last verified date: 2026-03-15
- Verified by: Codex (GPT-5.2-Codex)
- Commands:
  - `rg -n "open marker inventory|Open items|Go \(rollout-ready\)|Residual risk register" docs/unfinished-code-checklist.md docs/rollout-readiness-status.md docs/blackout_centralized_release_readiness_gate.md docs/ai-prompts-remaining-work.md`
  - `node _port/scripts/operations/docs_integrity_check.cjs`
