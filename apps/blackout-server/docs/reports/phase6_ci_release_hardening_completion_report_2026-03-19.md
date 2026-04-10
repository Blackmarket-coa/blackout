# Phase 6 completion report (CI/release hardening) — 2026-03-19

## Phase targeted

**Phase 6: CI/release hardening** from `docs/development/product_fork_execution_plan.md`.

## Incomplete tasks identified at start of this pass

1. Managed + standalone hosting smoke checks were not enforced in CI.
2. No single deterministic smoke entrypoint combined:
   - profile compatibility expectations,
   - fail-fast managed diagnostics,
   - health endpoint validation.
3. No explicit phase completion report artifact capturing blockers/risks/next prompt.

## Completed items in this pass

1. Added hosting smoke utility:
   - `synapse/util/hosting_smoke.py`
   - validates standalone profile resources remain `client/federation/health`,
   - validates managed fail-fast diagnostics path,
   - validates health endpoint checker against a local test server.
2. Added CI-invocable smoke wrapper:
   - `scripts-dev/blackout/ci_hosting_smoke.py`
3. Added test coverage:
   - `tests/util/test_hosting_smoke.py`
4. Hardened CI release gate workflow:
   - runs release-train gate,
   - runs divergence marker gate,
   - runs hosting profile smoke checks,
   - runs protocol compatibility smoke (`/_matrix/client/versions`).

## Remaining blockers

1. Docker image lifecycle ownership (stable/canary tag promotion policy) is still not
   fully codified in CI automation.
2. Provenance/SBOM publication linkage for release artifacts is not yet enforced by gate.
3. End-to-end managed startup smoke against real Postgres/Redis services is not yet part
   of this lightweight gate (current checks are fast and deterministic, but simulated).

## Risks

1. CI gate complexity growth may increase time-to-feedback if additional smoke scopes are
   added without careful runtime budgeting.
2. Simulated managed fail-fast checks may miss environment-specific networking issues that
   only appear in full integration environments.
3. Release process coupling to checklist/changelog files can create friction if templates
   drift from operator expectations.

## Exact next prompt

```text
Given the product fork execution plan and current repo state:
1) Implement Week 3 packaging/image lifecycle ownership:
   - publish/tag strategy docs and CI hooks for blackout-server:<version>, :stable, :canary
   - attach source revision + upstream base revision + build timestamp metadata
2) Add SBOM/provenance artifact pointer enforcement in release gates.
3) Add integration smoke in CI for managed profile with ephemeral Postgres/Redis services.
4) Add/update tests and docs.
5) Produce a completion report with completed items, blockers, risks, and next prompt.
```
