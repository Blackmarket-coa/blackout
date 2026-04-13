# Frontend Consolidation Work Doc — AI Prompt Pack

This work doc converts the consolidation assessment into execution-ready AI prompts with structured inputs/outputs, artifacts, and done criteria.

## Source

- `docs/architecture/frontend-consolidation-assessment.md`

## Objective

Create a **single canonical frontend runtime** in `apps/blackout-client` while preserving custom and legacy behavior from all current frontend surfaces.

## Consolidation scope (must be represented)

1. `apps/blackout-client` (canonical custom shell)
2. `apps/blackout-web` (migration shell)
3. `apps/web` (legacy browser shell)
4. `apps/blackout-gov` (governance surface)
5. `_port` + `legacy/element` (element-era references)
6. `blackout-desktop` + `blackout-mobile` (platform wrappers)

## Required parity feature families

- Core Matrix chat + room UX
- Governance
- Forum
- Dead-drop
- Moderation
- Steganography
- Auth/session/recovery/security flows
- Notifications and presence behaviors
- Media upload/viewer/camera/share/deeplink flows
- Settings and capability-gated administration surfaces

## Canonical architecture constraints

- Single route/nav/settings source of truth in `apps/blackout-client` via feature registry aggregation.
- Feature manifests per domain for routes/nav/settings/capabilities.
- No direct backend coupling from UI components; integration through `@blackout/sdk`.
- Cross-runtime contracts/events through `@blackout/protocol`.
- Shared primitives from workspace packages (`@blackout/core`, `@blackout/ui`, `@blackout/design`).
- Desktop/mobile remain thin wrappers around canonical web behavior.

---

## Data contract for every AI task

Require the AI agent to return these sections for each prompt run:

1. **Branch + commit context**
   - Branch name
   - Head commit SHA
   - Date/time (UTC)
2. **Input inventory**
   - Files scanned
   - Surfaces included/excluded with rationale
3. **Output changes**
   - Files created/updated
   - Route/nav/settings changes summarized
4. **Parity disposition table**
   - `feature_id`, `surface`, `family`, `status` (`kept|ported|deprecated`), `owner`, `evidence`
5. **Validation logs**
   - Exact commands run
   - Exit status per command
6. **Risks + follow-ups**
   - Open risks
   - Next owner/date

---

## AI prompts

### Prompt 1 — Build complete frontend parity matrix

```text
Create a frontend parity matrix from these sources:
- apps/blackout-client
- apps/blackout-web
- apps/web
- apps/blackout-gov
- _port
- legacy/element

Tasks:
1) Enumerate routes, nav entries, settings surfaces, and capability-gated panels.
2) Map each item to a feature family.
3) Output a normalized markdown table with columns:
   feature_id | source_surface | route_or_entry | family | status_seed | notes
4) Save matrix to docs/architecture/frontend-consolidation-parity-matrix.md.
5) Highlight duplicates and obvious gaps against apps/blackout-client.

Done when:
- Every source surface above is represented.
- Matrix includes all required feature families from this work doc.
```

### Prompt 2 — Classify parity disposition (kept/ported/deprecated)

```text
Using docs/architecture/frontend-consolidation-parity-matrix.md, classify each feature item as:
- kept (already canonical),
- ported (must migrate),
- deprecated (intentional removal with rationale).

Tasks:
1) Add columns: disposition, disposition_rationale, target_module, owner.
2) For each deprecated item, include explicit compatibility/user-impact rationale.
3) Save/update docs/architecture/frontend-consolidation-disposition.md.
4) Flag any item missing ownership.

Done when:
- Every matrix row has a disposition and rationale.
- No unowned "ported" item remains.
```

### Prompt 3 — Generate canonical module migration backlog

```text
Create an implementation backlog for all items marked "ported".

Tasks:
1) Group by target module in apps/blackout-client feature registry/manifests.
2) For each work item, define:
   - source behavior
   - destination module/manifest
   - sdk/protocol needs
   - acceptance test requirement
3) Prioritize by user impact and dependency ordering.
4) Save to docs/architecture/frontend-consolidation-migration-backlog.md.

Done when:
- Every "ported" item maps to a concrete backlog entry.
- Dependencies and critical path are explicit.
```

### Prompt 4 — Enforce SDK/protocol boundaries

```text
Audit candidate frontend changes for architecture boundary compliance.

Tasks:
1) Detect direct backend coupling in UI components for targeted migration areas.
2) Propose/implement moves to @blackout/sdk and @blackout/protocol contracts.
3) Produce a boundary report with findings and fixes.
4) Save to docs/architecture/frontend-consolidation-boundary-audit.md.

Validation commands:
- pnpm lint
- pnpm test (targeted suites)

Done when:
- New/updated frontend integrations use sdk/protocol boundaries.
- Boundary exceptions (if any) are documented with owner/date.
```

### Prompt 5 — Desktop/mobile wrapper parity verification

```text
Verify that blackout-desktop and blackout-mobile wrappers preserve behavior after canonical web consolidation.

Tasks:
1) Validate deep links, notifications, lifecycle hooks, and share/camera/media bridges.
2) Compare behavior before/after against canonical apps/blackout-client runtime.
3) Record pass/fail and unresolved parity gaps.
4) Save to docs/architecture/frontend-wrapper-parity-report.md.

Done when:
- Wrapper parity status is explicit for each native integration area.
- Any regression has owner, severity, and remediation ETA.
```

### Prompt 6 — CI migration safety gates

```text
Add/validate migration safety gates for frontend consolidation.

Tasks:
1) Add route/registry drift checks across legacy vs canonical surfaces.
2) Ensure CI keeps legacy surfaces green during staged migration.
3) Add checks for parity matrix/disposition freshness.
4) Update docs with gate definitions and failure handling.

Validation commands:
- pnpm lint
- pnpm test
- node _port/scripts/operations/docs_integrity_check.cjs

Done when:
- CI has explicit anti-drift checks tied to consolidation artifacts.
- Failure output points to exact doc/table rows needing action.
```

### Prompt 7 — Archive-readiness signoff

```text
Prepare deprecation/archive signoff package for duplicate shells.

Tasks:
1) Confirm every custom/legacy feature has disposition + evidence.
2) Confirm canonical registry renders all approved routes/nav/settings.
3) Confirm desktop/mobile wrappers consume canonical behavior without feature forks.
4) Produce go/no-go recommendation and archive checklist.

Output file:
- docs/architecture/frontend-consolidation-archive-signoff.md

Done when:
- Signoff package can be used directly in review.
- Recommendation is evidence-backed and explicit.
```

---

## Suggested execution order

1. Prompt 1 (parity matrix)
2. Prompt 2 (disposition)
3. Prompt 3 (migration backlog)
4. Prompt 4 (boundary audit)
5. Prompt 5 (wrapper parity)
6. Prompt 6 (CI gates)
7. Prompt 7 (archive signoff)

## Definition of done checklist

- [ ] Every custom and legacy feature has parity disposition.
- [ ] Canonical feature registry includes all approved routes/nav/settings.
- [ ] `@blackout/sdk` + `@blackout/protocol` are the default integration path.
- [ ] Desktop/mobile wrappers verified against canonical runtime.
- [ ] Duplicate frontends marked archived only after signoff evidence is complete.

## Suggested tracking metadata

Use this metadata block at the top of each generated artifact:

```yaml
frontend_consolidation:
  assessment_source: docs/architecture/frontend-consolidation-assessment.md
  canonical_shell: apps/blackout-client
  generated_by: <agent/model>
  generated_at_utc: <timestamp>
  branch: <branch>
  head_sha: <sha>
  status: draft|in_review|approved
```
