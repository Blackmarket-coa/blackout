# Local Synapse Fork Patches

This repository tracks upstream Synapse while carrying Blackout-specific extensions.

## Upstream sync discipline

1. Configure the canonical upstream remote:
   ```bash
   git remote add upstream https://github.com/element-hq/synapse.git
   ```
2. Merge upstream `develop` monthly, and immediately for security advisories.
3. Keep Blackout features isolated to `blackout_runtime/` and `blackout_runtime_tests/` wherever possible.
4. Document any unavoidable edits outside those directories in this file before merge/rebase.

## First upstream sync pass

- Completed initial upstream remote setup and fetch against `element-hq/synapse`:
  - `git remote add upstream https://github.com/element-hq/synapse.git`
  - `git fetch upstream develop --depth=1`
  - `git rev-list --left-right --count upstream/develop...HEAD` -> `1 310`
- Interpretation: this branch currently has 310 local commits not in `upstream/develop`, while upstream has 1 commit not present locally from the fetched head snapshot.


## Full upstream merge rehearsal

- Performed non-shallow upstream fetch:
  - `git fetch upstream develop`
- Rehearsed merge on temporary branch:
  - `git checkout -b merge-rehearsal-upstream`
  - `git merge --no-commit --no-ff upstream/develop` (failed: unrelated histories)
  - `git merge --no-commit --no-ff --allow-unrelated-histories upstream/develop` (rehearsal)
- Result: extensive `add/add` conflicts across the tree indicate this repository history currently diverges as unrelated from `element-hq/synapse`.
- Action: prefer a dedicated one-time history-reconciliation effort (or fresh fork baseline) before regular monthly merges can be reliably automated.

## Current non-upstreamed patch surface

Primary Blackout surface:
- `blackout_runtime/`: module semantics, API resources, and governance/reputation integration.
- `blackout_runtime_tests/`: runtime + integration coverage for Blackout behavior.
- `tests/blackout_runtime/`: end-to-end homeserver API tests for module behavior.

Current non-`blackout_runtime` deltas kept intentionally:
- `synapse/storage/_base.py`: cache invalidation fallback now safely handles non-cache callables (avoids crashing when a looked-up attribute has no `invalidate` method).
- `docs/bmc_server_execution_plan.md`: deployment/runbook-facing module enablement snippet.
- `DEPLOYMENT_READINESS.md`: rollout status pointers to execution plan.
- `PATCHES.md`: upstream merge discipline and fork delta log.

One direct core Synapse source edit is currently tracked in this phase (`synapse/storage/_base.py`) and should be monitored during upstream merges.

## 2026-03-17 readiness wave patch-log refresh

To keep upstream reconciliation explicit, the following non-`blackout_runtime/` deltas are currently present from readiness/CI hardening work:

- `synapse/handlers/federation_event.py`: convert blackout payload-strip validation failures into typed federation protocol errors.
- `synapse/handlers/message.py`: convert blackout payload-strip validation failures into typed client errors during local event creation.
- `synapse/synapse_rust/acl.py`: normalize ACL matching for case-insensitive host handling and bracketed-IPv6 parsing.
- `synapse/util/blackout.py`: accept `org.matrix.self_destruct_after` as schema-compatible TTL metadata.
- `tox.ini`: set explicit test-phase `PYTHONPATH={toxinidir}` for trial import reliability.
- `tests/federation/test_federation_client.py`, `tests/federation/test_federation_server.py`, `tests/handlers/test_federation_event.py`, `tests/handlers/test_message.py`, `tests/handlers/test_room_member.py`, `tests/handlers/test_send_email.py`: test harness and expectation updates aligned with stricter blackout/runtime behavior.
- `tests/blackout_runtime/__init__.py`: explicit package marker to stabilize trial module discovery.
- `docs/ci_readiness_triage_2026-03-17.md`, `docs/reports/readiness_next_25_steps_2026-03-17.md`: readiness execution logs and blocker tracking.

These files should be explicitly reviewed during any future upstream rebase/reconciliation effort.
