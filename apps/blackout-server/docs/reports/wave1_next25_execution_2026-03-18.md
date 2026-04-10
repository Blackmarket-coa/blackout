# Wave-1 Execution — Next 25 Steps (2026-03-18)

This report executes the **next 25 actions** after Wave-1 ticket activation.

Primary references:
- `docs/reports/wave1_activation_plan_2026-03-18.md`
- `docs/development/blackout_backend_plan_tracker.md`
- `docs/signaling_only_persistence_policy.md`

## Step-by-step execution log

1. Recomputed due-bucket counts from the backend tracker (`2026-03-22/24/25/26`).
2. Verified Wave-1 freeze still maps to 20/14/9/9 ticket counts.
3. Revalidated that each activated row includes DRI metadata.
4. Revalidated that each activated row includes a sprint ticket ID.
5. Revalidated that each activated row includes an implementation PR link.
6. Revalidated daily burn-down target is present in tracker controls.
7. Revalidated acceptance-test lock list is present in tracker controls.
8. Revalidated canonical policy matrix exists in persistence policy doc.
9. Revalidated migration-safe rollout note exists in persistence policy doc.
10. Revalidated protocol error contract note exists in Wave-1 activation report.
11. Revalidated client fallback reference (`blackout_client_compatibility_matrix`) is linked.
12. Revalidated infra/TURN secure coturn baseline is documented.
13. Revalidated infra dependency health checks are documented.
14. Revalidated setup/failure/fallback metrics contract is documented.
15. Revalidated signaling storm abuse defaults are documented.
16. Revalidated deployment go/no-go bucket evidence table exists.
17. Revalidated storage/persistence bucket evidence references are present.
18. Revalidated protocol bucket evidence references are present.
19. Revalidated infra/TURN bucket evidence references are present.
20. Revalidated retention bucket evidence references are present.
21. Executed policy-engine unit tests for persistence classification matrix.
22. Executed blackout message + federation handler conformance suites.
23. Re-ran formatting/lint checks for touched runtime/test files.
24. Re-ran newsfragment gate for PR 134 compatibility.
25. Published this report and linked it from canonical trackers.

## Evidence commands (executed)

```bash
rg -n "due: 2026-03-22|due: 2026-03-24|due: 2026-03-25|due: 2026-03-26" docs/development/blackout_backend_plan_tracker.md

poetry run pytest -q blackout_runtime_tests/test_policy_engine.py

poetry run python -m twisted.trial tests.handlers.test_message tests.handlers.test_federation_event

poetry run isort --check --diff blackout_runtime/policy_engine.py blackout_runtime_tests/test_policy_engine.py tests/handlers/test_federation_event.py
poetry run black --check --diff blackout_runtime/policy_engine.py blackout_runtime_tests/test_policy_engine.py tests/handlers/test_federation_event.py
poetry run ruff --quiet blackout_runtime/policy_engine.py blackout_runtime_tests/test_policy_engine.py tests/handlers/test_federation_event.py

PULL_REQUEST_NUMBER=134 scripts-dev/check-newsfragment.sh
```

## Current status after this next-25 tranche

- Ticket activation governance remains consistent and complete for all Wave-1 buckets.
- Acceptance tests and conformance suites for policy + blackout event handling are green in this runner.
- Live staging smoke execution remains blocked in this runner due missing staging endpoints/credentials.

## Immediate follow-up queue (post-next-25)

1. Attach live staging startup/federation/worker smoke evidence for each bucket closure.
2. Begin closing `W1-22-*` tickets against the 4/day burn-down target with per-ticket PR links.
3. Promote bucket rows from `[~]` to `[x]` only with linked test + staging evidence.
