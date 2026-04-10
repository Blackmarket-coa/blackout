# Weekly completion report

- Reporting period: `2026-02-22 .. 2026-02-28`
- Report owner: `Program Manager`
- Generated on: `2026-02-28`

## 1) Open-item count by scope class

Source of scope labels: `docs/scope_boundary.md`.

| Scope class | Open count | Delta vs prior week | Notes |
|---|---:|---:|---|
| required-now | 0 | -4 | Scope baseline + metadata closure items completed in tracker. |
| required-later | 5 | +0 | Marker governance + weekly reporting operational follow-ups remain planned. |
| not-in-scope | 0 | +0 | No open not-in-scope bullets are tracked as action items in the completion tracker. |
| deferred-with-signoff | 0 | +0 | No active deferred-with-signoff items. |

## 2) Marker delta (week-over-week)

| Metric | Value |
|---|---:|
| Prior-week marker total | 103 |
| Current marker total | 103 |
| Opened this week | 0 |
| Closed this week | 0 |
| Net delta | 0 |

## 3) Top-10 hotspot ownership changes

| Rank | Hotspot file/cluster | Current marker count | Owner (DRI) | WoW delta | Owner/status update |
|---:|---|---:|---|---:|---|
| 1 | `NOTIMPLEMENTED_AUDIT.md` | 12 | Runtime Reliability Lead | 0 | Retained as historical evidence artifact (`required-later`). |
| 2 | `docs/runtime_notimplemented_audit.md` | 10 | Runtime Reliability Lead | 0 | Retained as historical evidence artifact (`required-later`). |
| 3 | `docs/tracker_todo_fixme_report.md` | 7 | Program Manager | 0 | Generated reporting artifact retained for trend comparisons (`not-in-scope`). |
| 4 | `docs/notimplemented_audit_report.md` | 6 | Runtime Reliability Lead | 0 | Retained as audit narrative (`required-later`). |
| 5 | `tests/test_notimplemented_regressions.py` | 2 | QA Lead | 0 | Intentional regression assertions retained (`not-in-scope`). |
| 6 | `tests/util/test_check_dependencies.py` | 2 | QA Lead | 0 | Intentional abstract test-double coverage retained (`not-in-scope`). |
| 7 | `docs/marker_budget_policy.md` | 2 | Release Manager | 0 | Marker policy terms retained by design (`required-later`). |
| 8 | `docker/Dockerfile-dhvirtualenv` | 2 | Release Engineering Lead | 0 | Packaging follow-ups remain queued (`required-later`). |
| 9 | `synapse/http/federation/srv_resolver.py` | 2 | Runtime Reliability Lead | 0 | Twisted `DNS-N.I.E.` references only; no runtime raise risk (`not-in-scope`). |
| 10 | `docs/scope_alignment_evidence.md` | 1 | Federation Architecture Lead | +1 | New top-10 entrant; evidence wording retained for continuity (`required-later`). |

## 4) Blockers + owner + next action date

| Blocker | Impact | Owner | Next action | Next action date |
|---|---|---|---|---|
| `docker` unavailable in CI shell for HA compose validation | Cannot execute `contrib/docker_compose_workers/scripts/validate_ha_stack.sh` end-to-end in this environment | SRE Lead | Run validation in Docker-capable runner and attach output log to tracker | 2026-03-05 |
| Packaging [T]ODOs in `docker/Dockerfile-dhvirtualenv` | External build follow-ups still open | Release Engineering Lead | Resolve [T]ODOs or convert to issue-linked notes with owner/due metadata | 2026-03-21 |

## 5) Command sequence used to generate/populate this report

```bash
python - <<'PY'
from collections import Counter
from pathlib import Path
import re

text = Path("docs/project_completion_tracker.md").read_text().splitlines()
counter = Counter()
for line in text:
    if line.startswith("- [ ]") or line.startswith("- [-]"):
        m = re.search(r"\[(required-now|required-later|not-in-scope|deferred-with-signoff)\]", line)
        if m:
            counter[m.group(1)] += 1
for key in ["required-now", "required-later", "not-in-scope", "deferred-with-signoff"]:
    print(f"{key}: {counter[key]}")
PY

rg -n "[T]ODO|[F]IXME|[T]BD|[X]XX|[H]ACK|[N]otImplementedError|[T]ODO_test_" . -g '!INCOMPLETE_WORK.md' -g '!docs/marker_inventory.csv' | wc -l

python - <<'PY'
import subprocess
from collections import Counter

pat = r"[T]ODO|[F]IXME|[T]BD|[X]XX|[H]ACK|[N]otImplementedError|[T]ODO_test_"
out = subprocess.check_output(["rg", "-n", pat, "."], text=True)
counts = Counter()
for line in out.splitlines():
    f = line.split(":", 1)[0]
    if f.startswith("./"):
        f = f[2:]
    if f in {"INCOMPLETE_WORK.md", "docs/marker_inventory.csv"}:
        continue
    counts[f] += 1
for rank, (path, count) in enumerate(counts.most_common(10), start=1):
    print(f"{rank}. {path}: {count}")
PY

rg -n "raise [N]otImplementedError\(" synapse

python scripts-dev/check_marker_budget.py
```
