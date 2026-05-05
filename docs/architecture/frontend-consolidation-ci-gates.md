# Frontend Consolidation CI Safety Gates

This document defines anti-drift CI gates used during staged frontend consolidation to keep canonical and legacy surfaces synchronized until archive signoff.

## Gates

### 1) Route/registry drift gate (legacy vs canonical)

Command:

```bash
pnpm guard:frontend-consolidation
```

Script:
- `tools/ci/check-frontend-consolidation-gates.mjs`

Checks:
- Parity matrix includes all required source surfaces (`apps/blackout-client`, `apps/blackout-web`, `apps/web`, `apps/blackout-gov`).
- Legacy/canonical route anchors are present in parity matrix (canonical governance/forum/deaddrop routes plus their pre-archive `/blackout/...` historical anchors).
- `frontend-consolidation-parity-matrix.md` and `frontend-consolidation-disposition.md` remain in sync on `feature_id` and `status_seed`.
- Every disposition row has rationale; every `ported` row has owner.
- Every `ported` disposition row appears in migration backlog traceability table.

Failure output:
- Includes exact file and table row context where applicable (e.g., `docs/architecture/frontend-consolidation-disposition.md:<line> feature_id=...`).

### 2) Legacy surface health gate

Commands:

```bash
pnpm --filter @blackout/blackout-gov test
```

Purpose:
- Ensures the remaining legacy/migration surface (`apps/blackout-gov`) stays green during staged migration, avoiding regressions while parity work is incomplete.

## CI wiring

Workflow job: `.github/workflows/ci.yml` → `frontend-consolidation-safety-gates`

The job runs:
1. `pnpm guard:frontend-consolidation`
2. legacy surface tests (`@blackout/blackout-gov`)

## Failure handling

When a gate fails:
1. Read the emitted file/row-specific error from CI logs.
2. Update the referenced consolidation artifact rows (matrix/disposition/backlog) or route anchors.
3. Re-run locally:
   - `pnpm guard:frontend-consolidation`
4. If failure is a true exception, document it in:
   - `docs/architecture/frontend-consolidation-boundary-audit.md` (owner/date), and
   - the relevant disposition/backlog row(s).

## Notes

- These gates are anti-drift controls, not final archive approval.
- Archive/removal of duplicate surfaces still requires signoff artifacts and wrapper parity closure.
