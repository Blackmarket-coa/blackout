# Full completion execution plan (scope/compliance + work debt)

This plan converts all currently open scope/compliance items and active debt
signals into an execution sequence that can be run by AI agents end-to-end.

It is intended to be actionable in order, with objective completion gates,
explicit deliverables, and copy/paste prompts.

## 0) Canonical completion target

The repository is considered fully complete when all of the following are true:

- `docs/project_completion_tracker.md` has no open required checklist items.
- Scope labels are applied consistently (`required-now`, `required-later`, `not-in-scope`).
- Every open required item has owner + due date + measurable exit criteria + evidence link.
- G1/G2/G3 rollout milestones are either completed with evidence or explicitly deferred with sign-off.
- Marker debt is in budget, trending flat/downward, and scope-critical `must-fix` items are zero/unowned = zero.
- Weekly reporting minimum artifacts are published and linked.

---

## 1) Workstream map

### WS-A: Scope/compliance closure (from tracker open section)

Source: `docs/project_completion_tracker.md` section "Outstanding work for new scope".

Required outcomes:

1. Single scope boundary definition page.
2. Full re-validation and re-labeling of open bullets.
3. Owner/due/exit/evidence metadata for all required-now items.
4. Merge/process policy confirmation for generated reports.

### WS-B: Current debt closure (marker + runtime + backlog necessity)

Source: `INCOMPLETE_WORK.md` + tracker open action plan.

Required outcomes:

1. Marker inventory is refreshed on each wave and checked against budget.
2. Top hotspot files are triaged by necessity and either fixed, deferred, or scoped out.
3. Runtime-path risk remains at zero for request-serving paths.
4. Unowned `must-fix` items are eliminated.

### WS-C: Rollout milestone closure (G1/G2/G3)

Source: unchecked tracker items for G1/G2/G3.

Required outcomes:

1. Convert each milestone into dated acceptance checklist.
2. Link each item to tests, docs, scripts, dashboards, or runbooks.
3. Mark complete/deferred with explicit sign-off evidence.

### WS-D: Weekly reporting minimum operationalization

Source: tracker weekly reporting minimum section.

Required outcomes:

1. Publish scope class counts.
2. Publish marker deltas + hotspot ownership.
3. Publish blockers + owners + next action dates.

---

## 2) Execution order and deliverables

Run in strict order:

1. **Phase 1: Scope baseline lock**
2. **Phase 2: Tracker normalization + metadata hardening**
3. **Phase 3: Debt burn-down in prioritized waves**
4. **Phase 4: G1/G2/G3 acceptance closure**
5. **Phase 5: Weekly reporting automation/manual cadence lock**
6. **Phase 6: Final completion gate + release evidence package**

---

## 3) Copy/paste AI prompts by phase

## Phase 1 — Scope baseline lock

### Prompt P1

```text
You are working in this repository. Create a canonical scope boundary document and align trackers.

Objectives:
1) Create docs/scope_boundary.md with sections:
   - in-scope (required-now)
   - required-later
   - not-in-scope
   - deferred-with-signoff
   - mapping rules for classifying tasks
2) Update docs/project_completion_tracker.md to link to docs/scope_boundary.md as the only source of scope truth.
3) Re-label existing open tracker bullets to one of the scope classes.
4) Keep edits minimal, auditable, and reviewer-friendly.

Validation:
- Ensure all currently open tracker bullets have scope class labels.
- Ensure no conflicting scope definitions remain in other docs.

Commit message prefix: "docs: establish canonical scope boundary"
```

### Checks

```bash
rg -n "required-now|required-later|not-in-scope|deferred" docs/project_completion_tracker.md docs/scope_boundary.md
```

---

## Phase 2 — Tracker normalization + metadata hardening

### Prompt P2

```text
Normalize open tracker items so each required-now item has complete execution metadata.

Tasks:
1) For each open required-now item in docs/project_completion_tracker.md, add:
   - owner role
   - target date
   - measurable exit criteria
   - evidence path (file/dashboard/script/test)
2) Add a compact table: item -> owner -> due -> status -> evidence.
3) Add a "Definition of Done for tracker updates" section with strict required fields.
4) Do not mark items complete unless evidence already exists in repository.

Validation:
- No open required-now item missing owner/due/exit/evidence.

Commit message prefix: "docs: harden completion tracker metadata"
```

### Checks

```bash
rg -n "owner|due|exit criteria|evidence" docs/project_completion_tracker.md
```

---

## Phase 3 — Debt burn-down waves (repeat until closure)

### Prompt P3 (wave template)

```text
Execute one debt burn-down wave using INCOMPLETE_WORK.md and docs/project_completion_tracker.md.

Wave process:
1) Recompute marker inventory and identify top 10 hotspot files (excluding inventory artifacts).
2) Classify each hotspot task/comment as:
   - required-now fix
   - required-later
   - not-in-scope
3) For required-now items:
   - implement code/doc changes
   - add or update tests for behavior changes
   - remove stale markers or convert to issue-linked comments where appropriate
4) Update INCOMPLETE_WORK.md totals and hotspot list after changes.
5) Update docs/project_completion_tracker.md with wave summary:
   - what closed
   - what deferred and why
   - remaining owner/date

Safety:
- Do not remove intentional abstract interface N.I.E. branches (Not-Implemented runtime exception) without justification.
- Preserve runtime-path risk count at zero.

Commit message prefix: "debt: burn down required-now markers (wave N)"
```

### Checks

```bash
rg -n "[T]ODO|[F]IXME|[T]BD|[X]XX|[H]ACK|[N]otImplementedError|[T]ODO_test_" . -g '!INCOMPLETE_WORK.md' -g '!docs/marker_inventory.csv' | wc -l
rg -n "raise [N]otImplementedError\(" synapse
python scripts-dev/check_marker_budget.py
```

---

## Phase 4 — G1/G2/G3 acceptance closure

### Prompt P4

```text
Convert G1/G2/G3 tracker milestones into executable acceptance checklists and close them with evidence.

Tasks:
1) Expand each milestone into objective checks (pass/fail).
2) Link each check to implementation evidence (tests/scripts/docs/runbooks/metrics).
3) Run feasible checks in this environment and record outputs.
4) For checks not runnable here, document exact command and environment requirement.
5) Mark each milestone complete or deferred-with-signoff.

Validation:
- No milestone remains ambiguous (each item has explicit status + evidence/signoff).

Commit message prefix: "tracker: close rollout milestones g1-g3"
```

### Checks

```bash
rg -n "G1|G2|G3|deferred|sign-off|evidence" docs/project_completion_tracker.md
```

---

## Phase 5 — Weekly reporting minimum lock

### Prompt P5

```text
Operationalize weekly reporting minimum for scope/debt progress.

Tasks:
1) Add/update a weekly report template at docs/templates.md or a dedicated template file.
2) Ensure report includes:
   - open-item count by scope class
   - week-over-week marker delta
   - top-10 hotspot ownership changes
   - blockers + owner + next action date
3) Add a documented command sequence to generate/populate the report.
4) Add links from project tracker to the weekly report location.

Commit message prefix: "docs: operationalize weekly completion reporting"
```

### Checks

```bash
rg -n "required-now|required-later|not-in-scope|marker delta|blockers" docs/project_completion_tracker.md docs/templates.md docs
```

---

## Phase 6 — Final completion gate

### Prompt P6

```text
Run final completion gate and publish a closure report.

Tasks:
1) Verify all open required tracker items are closed or deferred with sign-off.
2) Verify marker budget check passes and trend is non-increasing.
3) Verify runtime-path N.I.E. risk remains zero in request-serving flows.
4) Produce docs/project_completion_closure_report.md containing:
   - checklist status (pass/fail)
   - evidence links
   - residual deferred items with approvals
   - recommendation: complete / not complete

Commit message prefix: "docs: publish full completion closure report"
```

### Checks

```bash
python scripts-dev/check_marker_budget.py
rg -n "^- \[ \]" docs/project_completion_tracker.md
rg -n "runtime-path-risk|[N]otImplementedError" docs/project_completion_closure_report.md docs/project_completion_tracker.md INCOMPLETE_WORK.md
```

---

## 4) Priority queue for first three debt waves

Use this queue before recomputing future waves:

1. `docs/project_completion_tracker.md` open scope/compliance items.
2. `INCOMPLETE_WORK.md` completion gate unchecked items and stale totals.
3. Highest hotspot files listed in `INCOMPLETE_WORK.md` (excluding intentional audit-only references where already justified).
4. Any newly introduced markers in `synapse/` that are classified as `must-fix`.

---

## 5) Governance rules for all AI-executed tasks

- Prefer minimal, reviewable commits by phase.
- Any behavior change must include tests (or explicit rationale when doc-only).
- Never mark completion without in-repo evidence path.
- Keep one canonical source for each policy area (scope, tracker, debt inventory).
- Update docs and tracker in the same PR as code changes when semantics change.

---

## 6) Definition of full completion (binary gate)

Mark full completion only when all conditions are true:

- `docs/project_completion_tracker.md` has no unchecked required-now items.
- G1/G2/G3 are completed or deferred-with-signoff + evidence.
- Marker budget check passes.
- Weekly report process is documented and first report is published.
- Closure report recommends `complete` with no blocking risks.
