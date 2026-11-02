# Blackout Product Fork Release Candidate Notes (RC1)

Release: `1.98.0-blackout.1`  
Date: `2026-03-19`  
Audience: platform operators / SRE / release engineering

> **2026-11-02.** The image these commands roll out and roll back,
> `ghcr.io/blackmarket-coa/blackout-server`, is the one
> `.github/workflows/blackout-image-lifecycle.yml` was written to build from
> `services/blackout-server/Dockerfile`. Both were removed with the Railway
> template in `42f68f2`, and so was that image's `entrypoint.sh`, which read
> `BLACKOUT_PROFILE` at container startup; the operator chose removal over
> fixing the template. No workflow in the tree builds or publishes that image
> now. Nor could the `kubectl exec` smoke commands below have run inside it as
> that Dockerfile built it: it copied `scripts-dev/` only into its build stage,
> its runtime image held `/usr/local`, the entrypoint and the template, and
> `pip install .` does not install `scripts-dev/` or `tests/`, which
> `pyproject.toml` puts in the sdist only. The fork image built today is
> `blackout-synapse:stable`, from `docker/Dockerfile`, by
> `infra/single-server-baseline/deploy.sh`, and this page is not a rollout
> procedure for it. The page is kept as the RC1 record.
>
> **2026-11-02.** `tests/util/test_hosting_smoke.py` and
> `scripts-dev/blackout/ci_hosting_smoke.py`, which the pre-promotion checks
> and the smoke probes below run, were removed on 2026-11-02 in `9493f41`, with
> the profile and managed-hosting helpers they checked; the operator chose
> removal ("remove both"). Run from this directory, those commands now fail
> on a missing file.
> `scripts-dev/check_release_train_gate.py`, `tests/util/test_release_train.py`
> and `test_versions_smoke_compatibility` remain.

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
