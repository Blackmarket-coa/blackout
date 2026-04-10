# W1-22 Closure Evidence (2026-03-18)

This artifact closes the W1-22 storage/persistence tranche (`W1-22-01` through `W1-22-20`) with implementation and test evidence.

## 1) Policy/doc closure (W1-22-01..06)

Completed and locked in canonical policy docs:

- Persisted surfaces (accounts, device keys/cross-signing, membership/auth-critical state, signaling metadata with TTL) are finalized in `docs/signaling_only_persistence_policy.md`.
- Non-persisted surfaces (`m.room.message`, `m.room.encrypted`, media binaries, search indexes) are finalized in the same policy document.
- Canonical matrix and migration-safe toggle guidance are captured in:
  - `docs/signaling_only_persistence_policy.md`
  - `docs/reports/wave1_activation_plan_2026-03-18.md`

## 2) Enforcement closure (W1-22-07..17)

Implemented behavior and code evidence:

- Hard-block timeline payload event classes in blackout mode:
  - local event creation path rejects `m.room.message` / `m.room.encrypted` with `403`.
  - unsupported timeline classes are rejected under blackout signaling-only rules.
- Federation ingress path applies the same blocked-class posture and signal-content validation.
- `blackout_signaling_only_mode` wiring enforces blackout mode and forces `enable_media_repo=False` and `enable_search=False` while active.
- Message-history retrieval/search/media surfaces are constrained by blackout mode configuration and handler behavior.

Primary code evidence references:

- `synapse/handlers/message.py`
- `synapse/handlers/federation_event.py`
- `synapse/config/server.py`
- `synapse/handlers/search.py`
- `synapse/storage/databases/main/search.py`

## 3) Integration/test closure (W1-22-18..20)

Executed test evidence:

```bash
poetry run pytest -q blackout_runtime_tests/test_policy_engine.py
poetry run python -m twisted.trial tests.handlers.test_message tests.handlers.test_federation_event tests.handlers.test_room_member
poetry run pytest -q tests/config/test_server.py
```

Observed outcomes in this runner:

- `blackout_runtime_tests/test_policy_engine.py`: **12 passed**.
- `tests.handlers.test_message` + `tests.handlers.test_federation_event` + `tests.handlers.test_room_member`: **passed** (`46` total; `1` postgres-only skip for replicated worker test).
- `tests/config/test_server.py`: **12 passed** (includes blackout-mode config parsing behavior).

## 4) W1-22 ticket closure map

- [x] W1-22-01 through W1-22-20 are complete and marked closed in `docs/development/blackout_backend_plan_tracker.md`.
- [x] Each closed row includes explicit `closure_evidence` reference to this artifact.

## 5) Residual risks / follow-up

- Live staging evidence remains externally blocked in this runner (missing staging credentials/endpoints).
- Post-W1-22 execution continues at W1-24/W1-25/W1-26 in-progress buckets.
