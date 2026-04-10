# Weekly completion report

- Reporting period: `2026-03-03 .. 2026-03-14`
- Report owner: `Program Manager`
- Generated on: `2026-03-14`

## 1) Scope-class open-item counts

Source of scope labels: `docs/scope_boundary.md`.

| Scope class | Open item count | Source |
|---|---:|---|
| Required-now | 61 | `docs/development/blackout_backend_plan_tracker.md` (open checklist tags) |
| Required-later | 34 | `docs/development/blackout_backend_plan_tracker.md` (open checklist tags) |
| Not-in-scope | 19 | `docs/development/blackout_backend_plan_tracker.md` (open checklist tags) |
| Deferred-with-signoff | 0 | `docs/development/blackout_backend_plan_tracker.md` (open checklist tags) |

## 2) marker budget enforcement + marker delta (week-over-week)

| Metric | Previous week | Current week | Delta | Status |
|---|---:|---:|---:|---|
| Marker budget status (`python scripts-dev/check_marker_budget.py`) | pass (`current=49`, `budget=503`) | pass (`current=43`, `budget=503`) | -6 | down |
| Markers opened | 9 | 2 | -7 | down |
| Markers closed | 0 | 0 | 0 | flat |
| Net marker change | +9 | +2 | -7 | down |

Notes:
- Marker inventory recount (`rg ... | wc -l`) changed from `49` to `51` in this reporting window, producing a net `+2`.
- Budget check remained compliant throughout the period.

## 3) Top-10 hotspot ownership updates

| Rank | Hotspot cluster | Owner (DRI) | WoW marker delta | Mitigation update |
|---:|---|---|---:|---|
| 1 | `NOTIMPLEMENTED_AUDIT.md` (`12`) | Runtime Reliability Lead | 0 | Retained as historical audit evidence (`required-later`). |
| 2 | `docs/runtime_notimplemented_audit.md` (`10`) | Runtime Reliability Lead | 0 | Retained as historical audit evidence (`required-later`). |
| 3 | `docs/tracker_todo_fixme_report.md` (`8`) | Program Manager | 0 | Reporting artifact retained for trend analysis (`not-in-scope`). |
| 4 | `docs/notimplemented_audit_report.md` (`6`) | Runtime Reliability Lead | 0 | Audit narrative retained and monitored (`required-later`). |
| 5 | `docs/repo_remaining_work_ai_prompts.md` (`2`) | Program Manager | +2 | New prompt-pack taxonomy references; keep bounded and review weekly. |
| 6 | `docs/project_completion_tracker.md` (`2`) | Program Manager | 0 | Governance wording stable; no new growth this cycle. |
| 7 | `docs/marker_budget_policy.md` (`2`) | Release Manager | 0 | Marker-policy taxonomy references remain intentional. |
| 8 | `docker/Dockerfile-dhvirtualenv` (`2`) | Release Engineering Lead | 0 | Packaging follow-up remains queued with owner/date. |
| 9 | `synapse/http/federation/srv_resolver.py` (`2`) | Runtime Reliability Lead | 0 | Twisted `DNSNotImplementedError` references only; no runtime raise risk. |
| 10 | `pylint.cfg` (`1`) | Core Server Maintainers | +1 | Lint guidance token reference accepted; monitor for further growth. |

## 4) Blockers with owner + next action date

| Blocker | Owner | Next action | Next action date |
|---|---|---|---|
| Packaging follow-up in `docker/Dockerfile-dhvirtualenv` | Release Engineering Lead | Convert remaining TODO marker to issue-linked note with owner/milestone metadata. | 2026-03-21 |
| Open `required-now` backlog breadth in blackout backend tracker | Federation Architecture Lead | Execute Wave 1 closure sprint and update BLK-101..BLK-120 status table with objective evidence links. | 2026-03-22 |
| Marker inventory drift (`49 -> 51`) | Program Manager + Runtime Reliability Lead | Publish per-file delta attribution in next report and validate no unowned growth hotspots. | 2026-03-21 |

## 5) Required-now ticket execution updates

| Ticket | Status | Owner | This-week progress | Next step |
|---|---|---|---|---|
| BLK-101 | In progress | Backend Lead | Signaling-only persistence policy approved and referenced from tracker. | Attach implementation/test evidence for write-path enforcement. |
| BLK-102 | In progress | Storage/API Engineer | Execution metadata and due dates operationalized in tracker. | Land write-path gate and migration-flag behavior checks. |
| BLK-103 | In progress | Platform Engineer | Disablement objectives and test expectations documented. | Validate media/index/history disablement in staging. |
| BLK-104 | Planned | QA/Backend Engineer | Validation requirements scoped and linked to wave plan. | Build integration/migration suite and attach CI evidence. |
| BLK-105 | In progress | Protocol Engineer | Signal schema/validator objectives linked in tracker. | Finalize schema bounds + conformance tests. |
| BLK-106 | In progress | API Engineer | Blocked-event enforcement/error-code objectives documented. | Ship stable error-code mapping tests. |
| BLK-107 | Planned | Client Liaison + QA | Interop/fallback requirements linked to compatibility matrix. | Add conformance fixtures and acceptance matrix results. |
| BLK-108 | In progress | Infra Lead | TURN default policy documented and linked. | Finalize secure coturn baseline and health checks. |
| BLK-109 | Planned | Security Engineer | Anti-abuse boundaries defined in wave plan. | Add rate-limit/abuse threshold validation hooks. |
| BLK-110 | In progress | Backend Lead | Retention compliance note linked from tracker. | Finalize TTL semantics and config behavior tests. |
| BLK-111 | Planned | Data Lifecycle Engineer | Purge implementation requirements captured. | Implement bounded purge + irretrievability checks. |
| BLK-112 | Planned | QA/Backend Engineer | Retention safety test objectives recorded. | Add auth-critical-state protection tests. |
| BLK-113 | Planned | Security Architect | Crypto alignment scope captured with due date. | Publish security addendum and checklist mapping. |
| BLK-114 | Planned | Mobile Performance Engineer | Viability baseline objectives documented. | Run first benchmark report and publish evidence. |
| BLK-115 | Planned | Program Manager + Backend Lead | Phase-1 gate criteria articulated in wave plan. | Execute demo gate and capture signoff evidence. |
| BLK-116 | In progress | Tech Lead | Marker-alignment cluster mapping tracked. | Link clusters to issue IDs and owners. |
| BLK-117 | In progress | Architecture Council | Blocker decision record linked from tracker. | Close residual blocker outcomes with explicit status row updates. |
| BLK-118 | Complete | Release Manager | Marker budget policy approved and signoff recorded. | Maintain weekly compliance verification. |
| BLK-119 | In progress | Program Manager | Weekly workflow now includes marker delta + blockers + DRI updates. | Continue weekly cadence and publish next report. |
| BLK-120 | In progress | Tech Lead | DRI ownership captured in hotspot section. | Keep hotspot owner rotations updated per week. |

## 6) Command sequence used

```bash
python - <<'PY'
import re
from pathlib import Path
counts={k:0 for k in ['required-now','required-later','not-in-scope','deferred-with-signoff']}
for line in Path('docs/development/blackout_backend_plan_tracker.md').read_text().splitlines():
    m=re.match(r'^\s*- \[ \] \[(required-now|required-later|not-in-scope|deferred-with-signoff)\] ', line)
    if m:
        counts[m.group(1)] += 1
print(counts)
PY

rg -n "[T]ODO|[F]IXME|[T]BD|[X]XX|[H]ACK|[N]otImplementedError|[T]ODO_test_" . -g '!INCOMPLETE_WORK.md' -g '!docs/marker_inventory.csv' | wc -l
python scripts-dev/check_marker_budget.py
```
