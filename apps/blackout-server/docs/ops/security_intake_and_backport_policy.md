# Security intake and backport policy (Blackout fork)

This policy defines how the Blackout fork ingests upstream security fixes and executes backports.

## Threat model assumptions

1. Public Matrix-facing services are internet-reachable and continuously probed.
2. Attackers may exploit protocol parsing, federation trust boundaries, auth flows, or dependency CVEs.
3. Operators may run lagging versions; release-train discipline is required to keep risk bounded.
4. Compromise impact includes confidentiality, integrity, and availability of homeserver data.

## Daily intake checklist

Run once per business day (UTC):

- [ ] Review upstream Synapse security advisories and commits since last intake.
- [ ] Review CVE feeds for key dependencies used by runtime images.
- [ ] Triage each finding: `not-applicable`, `monitor`, `backport-required`.
- [ ] Create/update tracking issue with severity and ownership.
- [ ] If `critical` or actively exploited, trigger emergency path immediately.

## Weekly backport window

Standard backport window: **Wednesdays 14:00–17:00 UTC**.

During the window:

- [ ] Finalize candidate backports from tracked intake issues.
- [ ] Apply patches and run targeted tests.
- [ ] Update `release/train/changelog.md` under `Security Backports` and
      `Backport Tracking -> Upstream patched commit IDs`.
- [ ] Run release-train gate and smoke checks before merge.

## Emergency severity policy and target SLAs

Severity classes and first-response/mitigation targets:

| Severity | Example | Acknowledge | Mitigation plan | Patch deployed |
|---|---|---:|---:|---:|
| Critical | Active exploit or auth bypass with public PoC | 30 min | 4 hours | 24 hours |
| High | Remote compromise or data exposure without active exploitation | 2 hours | 1 business day | 3 business days |
| Medium | Privilege boundary weakness with constrained preconditions | 1 business day | 3 business days | 10 business days |
| Low | Hardening-only / minimal practical impact | 2 business days | Next release train | Next release train |

## On-call escalation path

1. Security intake owner pages engineering on-call.
2. Engineering on-call pages security lead for severity validation.
3. For Critical/High:
   - Incident commander assigned immediately.
   - Product owner + operations lead notified.
   - Emergency change window opened.
4. Post-incident: retro + control improvements added to backlog.

## Automation hooks

Release CI gate enforces release-note hygiene:

- `release/train/changelog.md` must include:
  - `## Security Backports`
  - `## Backport Tracking`
  - `### Upstream patched commit IDs`
  - at least one backticked commit hash (e.g. `` `deadbeef` ``).

See:

- `scripts-dev/check_release_train_gate.py`
- `synapse/util/release_train.py`
- `.github/workflows/release-train-gate.yml`
