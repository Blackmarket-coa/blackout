# Media Pipeline Integrity Checklist (BO-502)

Status: Active checklist
Owner: Security Lead + Operations Lead
Updated: 2026-03-16

## Integrity controls

- [ ] Validate media content-type against allowed policy.
- [ ] Verify size limits and reject oversized payloads.
- [ ] Verify checksum/hash consistency for uploaded blobs.
- [ ] Enforce encryption-at-rest and secure key access boundaries.
- [ ] Confirm retention/deletion policy hooks execute and are auditable.

## Operational controls

- [ ] Alert on media ingestion anomalies (spikes, malformed payload rates).
- [ ] Verify log redaction for media metadata containing sensitive fields.
- [ ] Confirm backup/restore checks include media integrity spot checks.

## Evidence

- Runtime tests: `blackout_runtime_tests/`
- Weekly operations reporting: `docs/reports/weekly_completion_report_YYYY-MM-DD.md`
