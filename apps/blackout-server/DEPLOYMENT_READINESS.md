# Deployment Readiness Report

Date: 2026-03-02

## Scope
This report reflects a local validation pass on branch `work` focused on restoring build/tooling health and exercising the CI test matrix entrypoint.

## Tooling Remediation Performed

1. Repaired Poetry runtime dependency mismatch in the environment (`packaging`, `keyring`, `pkginfo`, `urllib3`) so Poetry commands run again.
2. Updated project dependency constraints to avoid known runtime breakages in this environment:
   - `pyOpenSSL` raised to `>=25.1.0` for compatibility with modern `cryptography` / OpenSSL bindings.
   - `prometheus-client` capped to `<0.21` to avoid MRO import failure in `synapse.metrics.InFlightGauge`.
3. Regenerated lockfile with `poetry lock`.

## Checks Run

- `poetry --version` → passed.
- `poetry check --lock` → passed (with deprecation warnings in project metadata layout).
- `tox` → started full matrix and reported missing local interpreters for `py37`, `py38`, `py39`.
- `tox -r -e py310` → executed a broad test sweep and surfaced many failing tests (both FAIL and ERROR).

## Assessment

Current status: **Not ready for deployment**.

Reasoning:

1. CI-equivalent matrix cannot be fully executed in this environment due missing Python interpreters (3.7/3.8/3.9).
2. The available `py310` run now executes, but reports numerous test failures across federation, handlers, and blackout-related suites.
3. Until those failures are triaged/fixed and the full matrix passes in CI, production deployment is high risk.

## Required Next Gates

1. Run full CI in an environment that includes all required Python versions.
2. Triage and resolve failing `py310` test suites discovered by tox.
3. Re-run the full matrix until all required jobs are green.
4. Execute staging smoke tests (startup, DB/migrations, federation flows, workers) before prod cutover.
## Strategic follow-up

A dedicated execution backlog for BMC-specific server work is now tracked in `docs/bmc_server_execution_plan.md`. That plan sequences runtime stabilization, upstream sync policy, governance/logistics integration APIs, and blackbox/Railway hardening milestones before deployment sign-off.

## 2026-03-17 validation addendum (requested rerun)

Additional rerun evidence gathered for the requested readiness actions:

- Attempted matrix command:
  - `tox -e py37,py38,py39,py310 -- tests.blackout_runtime tests.handlers tests.federation`
  - Result: `py37/py38/py39` blocked with `InterpreterNotFound` (`python3.7`, `python3.8`, `python3.9`).
- Executed equivalent py310 target suites directly with available interpreter:
  - `python3 -m twisted.trial tests.blackout_runtime tests.handlers tests.federation`
  - Result: `PASSED` (`Ran 610 tests in 481.431s`, `successes=473`, `skips=137`, no failures/errors).
- Attempted to run staging smoke sections 1.2–1.5 from `docs/server_usability_validation.md` against live staging.
  - Result: blocked due missing staging endpoint/credentials/runtime artifacts in this runner (no staging URL, API tokens, federation origin/destination, or backup-host filesystem access).

Updated assessment: **Still not ready for deployment from this runner alone**, because live-staging smoke evidence and full multi-interpreter tox matrix evidence are still incomplete despite py310-equivalent target suites passing.

## 2026-03-18 execution update (requested readiness gate run)

### Scope of this run

Executed the requested gate sequence on this branch:

1. Install/enable `tox`.
2. Ensure local availability of Python `3.7`, `3.8`, `3.9`, and `3.10`.
3. Run matrix command from `tox.ini` and archive output logs.
4. Attempt staging smoke checks (health + auth/room/federation) using environment-provided credentials/endpoints.
5. Attempt backup/restore drill commands against real backup sets.

### Evidence artifacts (local)

Saved under:

- `artifacts/readiness/2026-03-18/tox-matrix.log`
- `artifacts/readiness/2026-03-18/tox-matrix-after-pyenv-global.log`
- `artifacts/readiness/2026-03-18/staging-smoke.log`
- `artifacts/readiness/2026-03-18/backup-drill.log`

### Matrix execution result

Command executed:

```bash
python3.10 -m tox -e py37,py38,py39,py310 -- tests.blackout_runtime tests.handlers tests.federation
```

Outcome:

- `py310`: passed (`Ran 612 tests`, `PASSED (skips=86, successes=526)`).
- `py37`: failed during dependency resolution (`No matching distribution found for Pillow>=10.0.1`).
- `py38`: test import/type evaluation failure (`TypeError: 'type' object is not subscriptable` in `tests/handlers/test_room_member.py`).
- `py39`: environment import failures (`ModuleNotFoundError: No module named 'pkg_resources'` across many suites).

Matrix summary from tox:

- `ERROR: py37 ...`
- `ERROR: py38 ...`
- `ERROR: py39 ...`
- `py310: commands succeeded`

### Staging smoke result

Status: **blocked in this runner**.

`staging-smoke.log` reports missing required `STAGING_*` variables (no staging base URL, token, or federation endpoints were available in environment), so live staging health/auth/room/federation checks could not be executed here.

### Backup/restore drill result

Status: **blocked in this runner**.

`backup-drill.log` reports `/var/backups/postgres` missing, so no real backup artifacts were available for `backup_run.sh`, `backup_verify.sh`, or `quarterly_restore_drill.sh`.

## Deployment sign-off (as of 2026-03-18)

**GO/NO-GO: NO-GO for production deployment from this evidence set.**

Rationale:

1. The required tox matrix is not green (`py37`/`py38`/`py39` failing).
2. Staging smoke gates were not executed with real endpoint/credentials.
3. Backup/restore drills were not executed against real backup sets.

### Required remaining gates

1. Resolve cross-version failures (`py37` dependency floor, `py38` typing compatibility issue, `py39` missing `pkg_resources`/setuptools issue) and rerun matrix until all required envs pass.
2. Re-run staging smoke with valid staging configuration (`STAGING_*` inputs) and capture command outputs.
3. Run backup/restore drills on host/environment with production-like backup artifacts and PostgreSQL tooling, and attach verification reports.
