# Blackout Release Changelog

Version: `1.98.0-blackout.1` (RC1)
Release date: `2026-03-19`

## Fork Policy Changes

- Establishes the first fork release-train candidate using the `X.Y.Z-blackout.N` policy with required tracked artifacts for checklist, changelog, and image provenance.
- Enforces release-train guardrails in CI for release artifacts and section completeness to reduce accidental policy drift during fork-only changes.
- Keeps divergence review explicit through release checklist sign-off gates for upstream diff, CVE disposition, and backport intent.

## Runtime Defaults

- Introduces deterministic `BLACKOUT_PROFILE` startup behavior for containerized deployments via profile-aware entrypoint rendering.
- Adds managed-hosting readiness checks and smoke helpers so operators can validate minimum external dependency posture (database/redis and runtime compatibility) before promotion.
- Adds image lifecycle automation for fork images with `blackout-server:<version>`, `:canary`, and `:stable` tagging conventions.

## Security Backports

- No additional upstream security patch backports are bundled in RC1 beyond the selected `1.98.0` upstream baseline.
- RC1 includes mandatory security intake and backport-tracking documentation requirements; any deferred upstream security backport must be captured before GA.
- Validation notes: release gate validates security/backport sections and upstream patched commit listing format.

## Backport Tracking

### Upstream patched commit IDs

- `a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0` - placeholder tracking record for RC1 security section format verification (replace with concrete commit on first real backport).
