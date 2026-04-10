# Blackout Feature Registry Update Tracker

This tracker starts execution for correcting and maintaining feature status claims
that reference `Blackout_server`.

Legend:
- [ ] Not started
- [~] In progress
- [x] Complete
- [!] Blocked

Last updated: 2026-04-09

## Scope

- Canonical source for this pass: **Blackout_server evidence only**.
- Cross-repo claims (`blackout`, `Website`, `Infrastructure`, `FBM`) must include
  explicit evidence links from their source repos before status changes are accepted.

## Wave A — Immediate status corrections

- [~] FR-001 Reclassify `CI/CD Pipeline (GitHub Actions)` from `Not Started` to
      `Partial` for Blackout_server scope.
  - Evidence targets:
    - `.github/workflows/tests.yml`
    - `.github/workflows/docker.yml`
    - `.github/workflows/fix_lint.yaml`
  - Exit criteria:
    - Registry entry updated with scope note explaining repo-level CI vs
      full ecosystem CI.

- [~] FR-002 Reclassify `Railway Cloud Deployment` from `Not Started` to `Partial`.
  - Evidence targets:
    - `railway.toml`
    - `scripts-dev/railway/start.sh`
    - `services/blackout-server/Dockerfile`
    - `docs/railway_deploy.md`
  - Exit criteria:
    - Registry entry reflects shipped deployment scaffolding + remaining go-live gate.

- [ ] FR-003 Reclassify `Data Retention Policies` from `Not Started` to `Partial`
      (capability present, rollout may be pending).
  - Evidence targets:
    - `docs/usage/configuration/config_documentation.md` (retention section)
  - Exit criteria:
    - Entry distinguishes implemented backend capability vs policy rollout state.

## Wave B — Evidence-gating for currently asserted Implemented items

- [ ] FR-004 Validate or downgrade `Cloudflare Tunnel Routing` claim.
  - Required evidence:
    - Tracked config/service definition in this repo or linked Infra repo path.
  - Exit criteria:
    - Feature either has direct evidence links or is downgraded to `Partial`.

- [ ] FR-005 Validate or downgrade `TLS Certificates (Let's Encrypt)` claim.
  - Required evidence:
    - Renewal automation + DNS challenge config + verification artifact.
  - Exit criteria:
    - Feature either has direct evidence links or is downgraded to `Partial`.

## Hygiene

- [ ] FR-006 Deduplicate registry content and enforce one canonical source block.
  - Exit criteria:
    - No repeated full registry sections in published source.
    - Summary counters are generated from canonical records only.

## Reporting cadence

- Weekly update field to include in completion report:
  - FR ticket id
  - status change
  - proof links
  - reviewer
  - date
