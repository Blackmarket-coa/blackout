# Weekly completion reporting template

Use this template for the weekly reporting minimum referenced by
`docs/project_completion_tracker.md`.

- Reporting period: `<YYYY-MM-DD .. YYYY-MM-DD>`
- Report owner: `<role/name>`
- Generated on: `<YYYY-MM-DD>`

## 1) Open-item count by scope class

Source of scope labels: `docs/scope_boundary.md`.

| Scope class | Open count | Delta vs prior week | Notes |
|---|---:|---:|---|
| required-now |  |  |  |
| required-later |  |  |  |
| not-in-scope |  |  |  |
| deferred-with-signoff |  |  |  |

## 2) Marker delta (week-over-week)

| Metric | Value |
|---|---:|
| Prior-week marker total |  |
| Current marker total |  |
| Opened this week |  |
| Closed this week |  |
| Net delta |  |

## 3) Top-10 hotspot ownership changes

| Rank | Hotspot file/cluster | Current marker count | Owner (DRI) | WoW delta | Owner/status update |
|---:|---|---:|---|---:|---|
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |
| 4 |  |  |  |  |  |
| 5 |  |  |  |  |  |
| 6 |  |  |  |  |  |
| 7 |  |  |  |  |  |
| 8 |  |  |  |  |  |
| 9 |  |  |  |  |  |
| 10 |  |  |  |  |  |

## 4) Blockers + owner + next action date

| Blocker | Impact | Owner | Next action | Next action date |
|---|---|---|---|---|
|  |  |  |  |  |

## 5) Command sequence used to generate/populate this report

Run and paste outputs (or summarize with links to stored artifacts):

```bash
# 1) Open item count by scope class in the completion tracker.
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

# 2) Current marker total (excluding inventory artifacts).
rg -n "[T]ODO|[F]IXME|[T]BD|[X]XX|[H]ACK|[N]otImplementedError|[T]ODO_test_" . -g '!INCOMPLETE_WORK.md' -g '!docs/marker_inventory.csv' | wc -l

# 3) Top-10 hotspot files for ownership updates.
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

# 4) Runtime-path N.I.E. safety check for request-serving code.
rg -n "raise [N]otImplementedError\(" synapse

# 5) Marker budget gate.
python scripts-dev/check_marker_budget.py
```
