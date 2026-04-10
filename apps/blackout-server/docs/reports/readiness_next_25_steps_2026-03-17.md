# Readiness Execution — Next 25 Steps (2026-03-17)

This report records the *next 25 execution steps* after the prior 10-step readiness wave.

## Step-by-step execution log

1. **Bootstrapped local CI tooling** by installing `tox`/`tox-venv` in the container.
   - Status: ✅ Complete.
   - Evidence: `pip3 install tox-venv tox`.
2. **Corrected tox major-version compatibility** for this repository by pinning local CLI usage to tox v3.
   - Status: ✅ Complete.
   - Evidence: `pip3 install 'tox<4' 'virtualenv<21.0.0'`.
3. **Re-attempted py310 federated/handler runtime test lane in tox** to verify baseline behavior.
   - Status: ⚠️ Blocked by long dependency build in tox editable install path.
   - Evidence: `tox -e py310 -- tests.blackout_runtime tests.handlers tests.federation`.
4. **Installed editable project test environment directly via pip** to unblock trial-based execution without waiting for tox wheel churn.
   - Status: ✅ Complete.
   - Evidence: `pip3 install -e '.[test]'`.
5. **Executed blackout runtime e2e tests** to validate P0 module endpoints and rate-limit behavior.
   - Status: ✅ Complete.
   - Evidence: `python3 -m twisted.trial tests.blackout_runtime.test_module_e2e`.
6. **Executed blackout message handler suite** validating schema and rejection paths.
   - Status: ✅ Complete.
   - Evidence: `python3 -m twisted.trial tests.handlers.test_message`.
7. **Executed blackout federation ingress suite** to verify revocation and inline-payload logic.
   - Status: ✅ Complete.
   - Evidence: `python3 -m twisted.trial tests.handlers.test_federation_event`.
8. **Executed federation server ACL/state query suite** to verify ACL and state endpoint behavior.
   - Status: ✅ Complete.
   - Evidence: `python3 -m twisted.trial tests.federation.test_federation_server`.
9. **Executed room member rate-limiter suite** to verify join limiter behavior.
   - Status: ✅ Complete.
   - Evidence: `python3 -m twisted.trial tests.handlers.test_room_member`.
10. **Validated combined targeted lane (blackout + handlers + federation + room member) in one pass**.
    - Status: ✅ Complete (`59` successes, `1` postgres-only skip).
    - Evidence: `python3 -m twisted.trial tests.blackout_runtime.test_module_e2e tests.handlers.test_message tests.handlers.test_federation_event tests.federation.test_federation_server tests.handlers.test_room_member`.
11. **Re-ran py310 tox env recreation to keep CI-path parity under observation**.
    - Status: ⚠️ In progress (dependency compile latency; not a product-code failure).
    - Evidence: `tox -r -e py310 --notest`.
12. **Recorded py37/py38/py39 matrix constraint in current container**.
    - Status: ⚠️ Blocked by unavailable interpreters.
    - Evidence: `python3 --version` (only py310 interpreter available locally).
13. **Reviewed existing deployment readiness gate definitions** for consistency with executed checks.
    - Status: ✅ Complete.
    - Evidence: `DEPLOYMENT_READINESS.md`.
14. **Reviewed prior readiness/usability validation report** to avoid duplicate or contradictory gate criteria.
    - Status: ✅ Complete.
    - Evidence: `docs/server_usability_validation.md`.
15. **Reviewed existing patch-discipline register** for upstream-sync compliance coverage.
    - Status: ✅ Complete.
    - Evidence: `PATCHES.md`.
16. **Added a fresh readiness wave artifact** (this report) with explicit done/blocked split.
    - Status: ✅ Complete.
17. **Mapped current branch’s latest readiness-related code deltas** to ensure traceability.
    - Status: ✅ Complete.
    - Evidence: `git show --stat --name-only --oneline 92ee995`.
18. **Classified tox-path issue as environment/build-latency concern instead of application regression**.
    - Status: ✅ Complete.
19. **Confirmed blackout runtime endpoint liveness remains green** under trial execution.
    - Status: ✅ Complete.
20. **Confirmed ACL validation tests remain green after recent ACL/parser modifications**.
    - Status: ✅ Complete.
21. **Confirmed federation event blackhole/revocation protections remain green**.
    - Status: ✅ Complete.
22. **Confirmed join-rate limiter tests remain green after prior harness changes**.
    - Status: ✅ Complete.
23. **Updated patch ledger with newly broadened non-runtime patch surface** for future upstream reconciliation.
    - Status: ✅ Complete.
24. **Documented required external follow-up for full matrix completion** (multi-Python environment).
    - Status: ✅ Complete (handoff prepared).
25. **Prepared concrete immediate next actions for next execution wave**.
    - Status: ✅ Complete.

## Immediate follow-up queue (post-step-25)

1. Run `tox -e py37,py38,py39,py310 -- tests.blackout_runtime tests.handlers tests.federation` in a runner that has all four interpreters.
2. Execute staging smoke script from `docs/server_usability_validation.md` sections 1.2 through 1.5 against a live staging node.
3. Attach results + failures to this report and `DEPLOYMENT_READINESS.md` as go/no-go evidence.

## Execution addendum — requested matrix + staging rerun (2026-03-17)

### A) Full tox matrix request (`py37,py38,py39,py310`)

Command executed:

```bash
tox -e py37,py38,py39,py310 -- tests.blackout_runtime tests.handlers tests.federation
```

Observed result in this runner:
- `py37`: `InterpreterNotFound: python3.7`
- `py38`: `InterpreterNotFound: python3.8`
- `py39`: `InterpreterNotFound: python3.9`
- `py310`: environment creation started but full tox lane did not complete within practical time due heavy editable dependency build (PyICU compile path) in this container.

To still provide execution evidence for the requested test targets, ran the equivalent targets directly under the available Python 3.10 environment:

```bash
python3 -m twisted.trial tests.blackout_runtime tests.handlers tests.federation
```

Result:
- `PASSED` — `Ran 610 tests in 481.431s`
- `successes=473`, `skips=137`, `failures=0`, `errors=0`

### B) Staging smoke script request (`docs/server_usability_validation.md` sections 1.2–1.5)

Attempted to execute the sectioned command set against a live staging node, but this runner lacks required staging runtime context:
- no staging base URL / hostname provided,
- no staging credentials or tokens for client API smoke,
- no origin/destination pair for federation ping/smoke,
- no access to staging backup host/filesystem artifacts for backup/restore drills.

Evidence check:

```bash
env | rg -i 'staging|matrix|synapse|token|origin|destination|backup|postgres|homeserver'
```

Only `CODEX_INTERNAL_ORIGINATOR_OVERRIDE` is present; no deploy credentials/endpoints were available.

Therefore section 1.2–1.5 live-staging commands are **blocked by missing external environment inputs**, not by repository code/test failures.

### C) Go/No-Go evidence impact

Current evidence from this runner supports:
- code-level targeted regression confidence on py310-equivalent execution (`tests.blackout_runtime`, `tests.handlers`, `tests.federation`) with zero failures,
- unresolved deploy gate for multi-interpreter tox matrix and live staging smoke/backup drills until a staging-capable runner + credentials are provided.
