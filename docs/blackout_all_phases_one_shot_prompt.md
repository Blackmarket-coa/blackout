# Blackout All-Phases One-Shot Execution Prompt

Use this one-shot prompt with an AI coding/documentation agent to complete **all phases/work orders** in sequence while preserving evidence quality and tracker consistency.

## One-shot prompt

> You are executing the full Blackout centralized build program end-to-end. Use `docs/blackout_centralized_build_work_order.md` as the canonical source for scope, ordering, and done criteria.
>
> ### Primary objective
> Complete Work Orders 1 through 9 with production-grade implementation, tests, and documentation evidence, then produce a final release-readiness gate artifact.
>
> ### Mandatory execution order
> 1. Work Orders **1 + 8** (tracker normalization + high-priority unfinished markers).
> 2. Work Orders **2 + 3 + 4** (image stego integration, dead-drop profile, governance payload attestation).
> 3. Work Orders **5 + 7** (cell-based access enforcement + timing obfuscation policy engine).
> 4. Work Order **6** (mesh/off-grid relay baseline).
> 5. Work Order **9** (release-readiness synthesis).
>
> ### Non-negotiable quality bar (for every work order)
> - Implement complete code/docs changes required by the work-order “Done when” criteria.
> - Add or update automated tests (unit/integration/simulation as appropriate).
> - Run relevant validation commands and capture outputs.
> - Update trackers/checklists/counts in `docs/` so all numbers are synchronized.
> - Add concise evidence notes (what changed, why, commands run, results, risks/follow-ups).
> - Do not leave placeholder text like “this PR” in docs; replace with concrete references.
>
> ### Work-order specific requirements
>
> #### WO-1: Tracker normalization and evidence refresh
> - Audit all major trackers under `docs/` for schema consistency and stale status/counts.
> - Normalize status language to: `Complete`, `In progress`, `Partial`, `Blocked`.
> - Ensure each major tracker contains: `status`, `evidence`, `remaining work`, `next review date`, `owner`.
> - Add/refresh verification metadata blocks (date, verifier, exact commands).
>
> #### WO-8: High-priority unfinished markers
> - Use `docs/unfinished-code-priority-plan.md` and `docs/unfinished-code-checklist.md`.
> - Close the next unresolved batch in strict priority order (remaining P0, then P1).
> - For each marker closed:
>   - remove/resolve source TODO/FIXME marker via concrete implementation,
>   - add regression tests,
>   - regenerate checklist counts,
>   - update priority plan + project tracker inventory counts.
>
> #### WO-2: Image stego integration path
> - Implement client-side image stego embedding before Matrix media upload.
> - Add feature flag gate, payload size limits, corruption handling, and rollback path.
> - Add encode/decode round-trip tests on representative media fixtures.
>
> #### WO-3: Dead-drop room profile
> - Implement unlisted room defaults + strict invite/access policy + auto-expiring encrypted messages.
> - Add explicit UI indicators for expiry semantics.
> - Add policy/retention tests and operator configuration docs.
>
> #### WO-4: Governance payload attestation in media channels
> - Define signed governance payload envelope with schema versioning.
> - Implement signer binding, deterministic verification, and auditable rejection reasons.
> - Add unit tests for valid/invalid payload behavior.
>
> #### WO-5: Cell-structured access enforcement
> - Implement chapter/cell templates using Matrix spaces + room ACL defaults.
> - Enforce chapter-local visibility with explicitly shared broadcast channels only.
> - Add boundary/containment integration tests.
>
> #### WO-7: Timing obfuscation policy engine
> - Add room-level random-delay + batching policies with safe bounds/defaults.
> - Add abuse protections and UX guardrails.
> - Add privacy-safe telemetry for baseline vs obfuscated leakage comparison.
>
> #### WO-6: Mesh/off-grid relay baseline
> - Implement minimal Blackout_blackbox relay mode with store-and-forward.
> - Implement eventual federation resync and partition conflict-resolution semantics.
> - Add simulation scenarios showing offline->online recovery reproducibility.
>
> #### WO-9: Release-readiness synthesis
> - Produce final release gate report covering:
>   - security controls,
>   - governance readiness,
>   - stego/dead-drop/cell-model completion,
>   - mesh/off-grid runbook validity,
>   - timing-obfuscation tradeoffs,
>   - go/no-go criteria with owner/date sign-off blocks.
>
> ### Required outputs
> 1. Code + docs changes implementing all work orders.
> 2. Updated tracker suite with synchronized counts and status.
> 3. `docs/` evidence artifacts per work order using the reporting template fields:
>    - Work order
>    - Owner
>    - Date completed
>    - Files changed
>    - Tests/commands run
>    - Evidence links
>    - Risks/known follow-ups
>    - Next review date
> 4. Final release-readiness report usable directly as gate artifact.
>
> ### Completion checklist (must all be true)
> - Every work order’s “Done when” condition is satisfied.
> - No tracker count mismatches remain across `docs/`.
> - Every completed implementation has linked tests and evidence.
> - Residual risks are explicitly documented with owners and dates.
> - Final go/no-go recommendation is explicit and justified.

## Usage note

Use this prompt as-is for “single-pass program completion,” or adapt the output section to split delivery into milestone PRs while keeping the same acceptance criteria.
