# Security Phase 1 Foundation (Completed)

This document captures the completed implementation for **Phase 1 (Weeks 1–2)** from `docs/security-resilience-build-plan.md` and provides the required operator runbook items that cannot be enforced solely through repository files.

## 1) Security baseline in CI

Implemented in `.github/workflows/security.yml`:

- **Dependency vulnerability audit**: `yarn npm audit --severity high` and OSV lockfile scanning.
- **SAST**: Semgrep rulesets (`p/security-audit`, `p/secrets`).
- **Secret scanning**: Gitleaks on every pull request and push.
- **Filesystem vulnerability scan**: Trivy, failing on `CRITICAL,HIGH` severities.

### Required protection behavior

- Keep this workflow required in branch protection for `develop` and `master`.
- Do not allow bypass of failed security checks on pull requests.

## 2) Branch protection + CODEOWNERS-required review

`CODEOWNERS` is already present at `.github/CODEOWNERS`, with owners for all files and elevated ownership for sensitive areas (workflows, security/crypto paths, dependency files).

Repository admins should configure branch protection with:

- **Require a pull request before merging**.
- **Require approvals** (minimum one, recommended two for sensitive repos).
- **Require review from Code Owners**.
- **Require status checks to pass** including the `Security checks` workflow.
- **Require branches to be up to date before merging**.
- **Disable force pushes** and **disable branch deletion** for protected branches.

## 3) Centralized config and secrets workflow

Use this single process for all CI/CD secret and config management:

1. **Inventory secrets** in repository/environment secrets and remove unused entries quarterly.
2. **Store runtime config in non-secret config files** (`config.json` variants) and keep secrets in platform secret stores only.
3. **Use environment-scoped secrets** for deployment credentials instead of repository-wide defaults when possible.
4. **Rotate sensitive credentials** (tokens/keys) on a recurring schedule and after any suspected exposure.
5. **Gate secret additions/changes via CODEOWNERS review** by requiring PRs for workflow/config changes.
6. **Validate no plaintext secret material lands in git** with mandatory Gitleaks checks.

## Definition of done for Phase 1

- Security checks run for every PR and push to long-lived branches.
- High/critical findings fail CI.
- CODEOWNERS-backed review gates are in place.
- Secret/config workflow is documented and enforced operationally.
