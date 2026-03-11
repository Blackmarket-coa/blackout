# PHASE0_STATUS

This file tracks implementation of **Phase 0 — Preserve and Audit** from the migration plan.

## Completed in-repo

- Created local preservation branch: `archive/element-web-fork`.
- Created local snapshot tag: `v0-element-fork`.
- Added migration inventory: `MIGRATION_INVENTORY.md`.
- Added reproducible audit script: `scripts/migration/phase0_audit.sh`.
- Generated artifact set under `audit/phase0/`:
  - `module_system_files.txt`
  - `shared_components_src_files.txt`
  - `patch_files.txt`
  - `kubernetes_files.txt`
  - `debian_files.txt`
  - `blackout_keyword_hits.txt`
  - `branding_candidates.txt`

## Not completed in this environment

- `git push origin archive/element-web-fork`
- `git push origin v0-element-fork`

Reason: no `origin` remote is configured in this environment (`git remote -v` is empty).

## External close-out steps (run in real dev clone)

Run the two required push commands in a clone where `origin` is configured:

```bash
git push origin archive/element-web-fork
git push origin v0-element-fork
```

Then verify and record completion:

```bash
git ls-remote --heads --tags origin "archive/element-web-fork" "v0-element-fork"
```

Expected result: one head ref for `archive/element-web-fork` and one tag ref for `v0-element-fork`.

Once verified, this Phase 0 status can be updated by moving those two bullets from "Not completed" to "Completed in-repo/external".

## Regeneration

Run the audit generator from repo root:

```bash
./scripts/migration/phase0_audit.sh
```
