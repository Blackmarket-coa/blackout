# Product fork AI prompts (completion-oriented)

Use these prompts with an implementation agent to drive the product-fork plan to completion.
They are written to produce merge-ready outputs with tests, docs, and rollback notes.

## Global prompt contract

Use this preface before any phase prompt:

```text
You are implementing a protocol-compatible product fork of Blackout Server.
Constraints:
- Keep Matrix/Synapse protocol compatibility.
- Prefer additive changes behind feature flags.
- Include migration/rollback notes for every behavior change.
- Add/update tests for every functional change.
- Update docs for operator-facing changes.
- Return: summary, changed files, tests run, risks, and follow-ups.
```

## Phase 0: Billing + feature gates foundation

```text
Implement Phase 0 foundations for monetization gating without changing protocol behavior.

Tasks:
1) Add tier model and feature gate interfaces (no hard-coded UI logic).
2) Add env/config wiring for billing provider keys and webhook secrets.
3) Add webhook event handlers for upgrade/downgrade/cancel state transitions.
4) Add tests for entitlement transitions and idempotent webhook processing.
5) Add operator docs: required secrets, local dev stubs, failure modes.

Deliverables:
- New/updated files list
- Test evidence
- Data model migration notes
- Rollback plan
```

## Phase 1: Runtime profile completion (`managed` / `standalone` / `constrained`)

```text
Implement explicit BLACKOUT_PROFILE handling in blackout-server startup.

Requirements:
- Deterministic profile selection and startup logging.
- managed: require postgres+redis dependencies and fail with actionable errors.
- standalone: generate sqlite-safe config and healthcheck-compatible listener settings.
- constrained: tune conservative defaults for low-resource operation.
- Keep protocol endpoints compatible.

Add:
- unit/integration tests for profile behavior
- docs with profile decision table
- compatibility smoke check for `/_matrix/client/versions`
```

## Phase 2: Release train ownership

```text
Implement release-train scaffolding for product fork ownership.

Tasks:
1) Add release checklist template with upstream diff/CVE/backport sections.
2) Add changelog template sections: fork-policy/runtime-defaults/security-backports.
3) Add CI release gate that verifies checklist artifacts exist.
4) Add docs for versioning policy (`X.Y.Z-blackout.N`).

Output must include:
- failing scenario examples and how gates catch them
- minimal maintainer workflow commands
```

## Phase 3: Security backport workflow

```text
Implement security intake and backport documentation + automation hooks.

Requirements:
- Daily intake checklist and weekly backport window documented.
- Emergency severity policy with target SLAs.
- Track upstream patched commit IDs in release notes.
- Add CI check that release notes include security/backport section.

Include:
- threat model assumptions
- on-call escalation path
```

## Phase 4: Managed hosting readiness

```text
Implement managed-hosting readiness checks and operator controls.

Tasks:
1) Add health/readiness checks for managed deployments.
2) Add backup/restore verification hooks and failure alert guidance.
3) Add deployment profile docs for Railway/container hosting.
4) Add tests or smoke scripts for startup, health endpoint, and fail-fast diagnostics.

Keep changes protocol-compatible and reversible via configuration.
```

## Phase 5: Selective divergence guardrails

```text
Implement guardrails to allow selective divergence without interoperability breakage.

Requirements:
- Add policy doc classifying allowed/prohibited divergence.
- Add CI/static check markers for risky changes (auth/signing/federation paths).
- Require explicit "divergence note" in PR template for behavior changes.
- Add tests demonstrating unchanged federation/client compatibility for modified paths.
```

## Completion prompts (cross-phase)

### A. "Finish this phase"

```text
Given the product fork execution plan and current repo state:
1) Identify incomplete tasks for [PHASE_NAME].
2) Implement the highest-leverage incomplete tasks.
3) Add/adjust tests and docs.
4) Produce a completion report with:
   - completed items
   - remaining blockers
   - risks
   - exact next prompt
```

### B. "Audit for release readiness"

```text
Audit the repo for product-fork release readiness.
Check:
- profile behavior correctness
- CI/release gates
- security backport documentation
- rollback/migration notes
- healthcheck compatibility

Return:
- pass/fail per category
- concrete fixes with file-level recommendations
- smallest safe release candidate scope
```

### C. "Prepare RC"

```text
Prepare release candidate RC1 for product fork:
- bump version following policy
- assemble changelog with fork-policy/runtime/security sections
- verify required checklists and test gates
- generate operator release notes
- include rollback command sequence
```

