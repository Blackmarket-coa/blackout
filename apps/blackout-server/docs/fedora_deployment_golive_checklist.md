# Fedora deployment go-live checklist

_Date: 2026-03-27_

Use this checklist to convert Fedora deployment readiness into an objective pass/fail decision.

## 1) Package and service baseline

- [ ] Install package: `sudo dnf install matrix-synapse`.
- [ ] Confirm service file exists and is enabled for boot.
- [ ] Confirm `python -m synapse.app.homeserver --version` returns the expected release.

## 2) Configuration and startup validation

- [ ] Validate homeserver config parses without warnings.
- [ ] Start service and verify health endpoint (`/health`) returns `OK`.
- [ ] Verify signing key and media store paths are writable by the service account.

## 3) Database and backup/restore drills (production gate)

- [ ] Run PostgreSQL backup against production-like data volume.
- [ ] Restore into clean staging environment and run schema integrity checks.
- [ ] Run startup + federation smoke tests against restored instance.
- [ ] Record objective evidence artifacts (command output + timestamps).

## 4) Security and operations hardening

- [ ] Confirm TLS cert rotation workflow and alerting are active.
- [ ] Confirm log retention + redaction policy and file permissions.
- [ ] Confirm firewall/SELinux policies allow only intended traffic paths.

## 5) Final decision rubric

Mark **DEPLOYABLE** only when all boxes are checked and evidence is stored in-repo or in linked runbook artifacts.
If any backup/restore drill item is incomplete, classify as **NOT DEPLOYABLE YET (production)**.
