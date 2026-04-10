# Blackout Product Fork Release Candidate Notes (RC1)

Release: `1.98.0-blackout.1`  
Date: `2026-03-19`  
Audience: platform operators / SRE / release engineering

## Scope

RC1 packages fork release-train controls, profile-aware startup defaults, managed-hosting readiness checks, and image lifecycle automation needed for first controlled rollout.

## Included changes

1. **Release-train enforcement**
   - Required release artifacts and section validation in CI (`checklist`, `changelog`, `image_provenance`).
2. **Runtime/profile controls**
   - Deterministic `BLACKOUT_PROFILE` behavior at container startup.
   - Managed-readiness helper scripts for preflight checks.
3. **Image lifecycle**
   - Multi-tag image pipeline (`:<version>`, `:canary`, `:stable`) and OCI metadata/provenance fields.
4. **Security/process**
   - Security backport intake + tracking sections are mandatory in release artifacts.

## Required pre-promotion checks

Run before promoting RC1 to stable:

```bash
python scripts-dev/check_release_train_gate.py
python -m pytest tests/util/test_release_train.py tests/util/test_hosting_smoke.py
python -m pytest tests/rest/client/test_versions.py::VersionsServletTestCase::test_versions_smoke_compatibility
python scripts-dev/blackout/ci_hosting_smoke.py
```

## Rollout command sequence (canary first)

```bash
# pull RC1 image
crane pull ghcr.io/blackmarket-coa/blackout-server:1.98.0-blackout.1 /tmp/blackout-rc1.tar

# deploy canary with explicit profile
kubectl -n blackout set image deploy/blackout-server blackout-server=ghcr.io/blackmarket-coa/blackout-server:1.98.0-blackout.1
kubectl -n blackout set env deploy/blackout-server BLACKOUT_PROFILE=managed
kubectl -n blackout rollout status deploy/blackout-server --timeout=300s

# smoke probes
kubectl -n blackout exec deploy/blackout-server -- python scripts-dev/blackout/ci_hosting_smoke.py
kubectl -n blackout exec deploy/blackout-server -- python scripts-dev/check_release_train_gate.py
```

## Rollback command sequence

```bash
# identify previous stable image
PREV_IMAGE="ghcr.io/blackmarket-coa/blackout-server:stable"

# roll deployment back to previous stable image
kubectl -n blackout set image deploy/blackout-server blackout-server=${PREV_IMAGE}
kubectl -n blackout rollout status deploy/blackout-server --timeout=300s

# confirm API compatibility + health
kubectl -n blackout exec deploy/blackout-server -- python -m pytest \
  tests/rest/client/test_versions.py::VersionsServletTestCase::test_versions_smoke_compatibility
kubectl -n blackout exec deploy/blackout-server -- python scripts-dev/blackout/ci_hosting_smoke.py
```

## Operator sign-off checklist

- [ ] Canary error budget unchanged for 30 minutes.
- [ ] Readiness and compatibility smokes green after deploy.
- [ ] Rollback rehearsal command sequence validated in staging.
- [ ] Release artifacts archived with RC1 run metadata.
