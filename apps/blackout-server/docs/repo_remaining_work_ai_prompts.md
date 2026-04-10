# Repository remaining work — AI prompt pack (complete coverage)

_Date: 2026-03-15_

This prompt pack is the **single operator-ready catalog** for all currently open
checklist work left in this repository, refreshed from a repo-wide scan.

## 1) What is still open (repo snapshot)

The following command was used to locate open checklist items in Markdown files:

```bash
python - <<'PY'
import re
from pathlib import Path
from collections import Counter
c=Counter()
for p in Path('.').rglob('*.md'):
    try:
        txt=p.read_text()
    except Exception:
        continue
    n=sum(1 for line in txt.splitlines() if re.match(r'^- \[ \]', line))
    if n:
        c[str(p)] = n
for k,v in c.most_common():
    print(f"{k}\t{v}")
print('TOTAL\t'+str(sum(c.values())))
PY
```

Open-item counts by file:

| File | Open items |
|---|---:|
| `docs/development/blackout_backend_plan_tracker.md` | 92 |
| `docs/distributed_self_healing_blueprint.md` | 25 |
| **Total** | **117** |

## 2) Execution order (strict)

1. **Close all `required-now` items in the backend tracker** (release-critical).
2. **Resolve remaining `required-later` and `not-in-scope` tracker rows** with completion evidence or explicit deferred signoff metadata.
3. **Reconcile deferred checklist items in the distributed self-healing blueprint** into an approved roadmap table (owner/date/approval/trigger/evidence).
4. **Run final closure gate** and publish a refreshed closure report.

---

## 3) AI prompts for *all* remaining work

### Prompt R1 — Close all release-critical backend tracker items (`required-now`)

```text
You are working in this repository. Close every open [required-now] checklist item in docs/development/blackout_backend_plan_tracker.md.

Tasks:
1) For each open [required-now] item, either:
   - complete it and mark checked with concrete in-repo evidence references, OR
   - convert to deferred-with-signoff including owner, due date, approver, and trigger.
2) Ensure each item has explicit exit criteria and evidence links.
3) Keep labels aligned with docs/scope_boundary.md and preserve protocol constraints.
4) Update docs/project_completion_tracker.md if completion/deferment status changes impact global tracker summaries.

Validation:
- rg -n "^- \[ \] \[required-now\]" docs/development/blackout_backend_plan_tracker.md returns zero lines.
- rg -n "owner:|due:|exit criteria:|evidence:" docs/development/blackout_backend_plan_tracker.md confirms metadata completeness.

Commit message prefix: "tracker: close required-now backend items"
```

### Prompt R2 — Close remaining backend tracker non-critical backlog (`required-later`, `not-in-scope`)

```text
You are working in this repository. Resolve all remaining open checklist items in docs/development/blackout_backend_plan_tracker.md after required-now closure.

Tasks:
1) For [required-later] items:
   - complete with evidence, OR
   - defer-with-signoff including owner/date/approval/trigger metadata.
2) For [not-in-scope] items:
   - keep as checklist only if intentionally open with explicit rationale,
   - otherwise convert to signoff/deferred records in a dedicated section.
3) Add/refresh a compact status table mapping item -> class -> owner -> status -> evidence.
4) Keep item wording stable unless needed for auditability.

Validation:
- rg -n "^- \[ \]" docs/development/blackout_backend_plan_tracker.md returns zero lines OR only explicitly deferred-with-signoff rows with full metadata.
- rg -n "required-later|not-in-scope|deferred-with-signoff|owner:|due:|approval:|trigger:|evidence:" docs/development/blackout_backend_plan_tracker.md

Commit message prefix: "tracker: reconcile remaining backend backlog"
```

### Prompt R3 — Reconcile all remaining self-healing blueprint checklist items

```text
You are working in this repository. Resolve all open checklist items in docs/distributed_self_healing_blueprint.md.

Tasks:
1) For each open item, choose one path:
   - complete now with in-repo evidence links, OR
   - convert to deferred-with-signoff with full metadata.
2) Ensure each deferred item includes:
   - Owner,
   - Due date,
   - Approval authority + date,
   - Trigger for re-evaluation,
   - Evidence tag/link.
3) Add/refresh an appendix table summarizing remaining deferred blueprint work.
4) Keep architecture recommendations intact; focus on execution traceability.

Validation:
- rg -n "^- \[ \]" docs/distributed_self_healing_blueprint.md returns zero lines OR only intentionally deferred rows with complete metadata.
- rg -n "Owner:|Due:|Approval:|Trigger|Evidence:" docs/distributed_self_healing_blueprint.md

Commit message prefix: "docs: reconcile self-healing blueprint backlog"
```

### Prompt R4 — Final repo-wide closure gate and publication

```text
You are working in this repository. Run a final remaining-work gate and publish closure status.

Tasks:
1) Re-scan open checklist items across all Markdown files.
2) Update docs/project_completion_closure_report.md with:
   - remaining open item count by file,
   - completed since prior scan,
   - deferred-with-signoff inventory,
   - go/no-go recommendation for release readiness docs.
3) If any open items remain, ensure each has owner/date/approval/trigger/evidence metadata.
4) Update docs/repo_remaining_work_ai_prompts.md counts if closure status changed.

Validation commands:
- python - <<'PY'
import re
from pathlib import Path
from collections import Counter
c=Counter()
for p in Path('.').rglob('*.md'):
    try: txt=p.read_text()
    except Exception: continue
    n=sum(1 for line in txt.splitlines() if re.match(r'^- \[ \]', line))
    if n: c[str(p)] = n
for k,v in c.most_common(): print(f"{k}\t{v}")
print('TOTAL\t'+str(sum(c.values())))
PY
- python scripts-dev/check_marker_budget.py

Commit message prefix: "docs: publish final remaining-work closure gate"
```

---

## 4) Operator command bundle

```bash
# 1) repo-wide open-checklist scan (Markdown)
python - <<'PY'
import re
from pathlib import Path
from collections import Counter
c=Counter()
for p in Path('.').rglob('*.md'):
    try:
        txt=p.read_text()
    except Exception:
        continue
    n=sum(1 for line in txt.splitlines() if re.match(r'^- \[ \]', line))
    if n:
        c[str(p)] = n
for k,v in c.most_common():
    print(f"{k}\t{v}")
print('TOTAL\t'+str(sum(c.values())))
PY

# 2) backend tracker open rows
rg -n "^- \[ \]" docs/development/blackout_backend_plan_tracker.md

# 3) self-healing blueprint open rows
rg -n "^- \[ \]" docs/distributed_self_healing_blueprint.md

# 4) marker budget sanity
python scripts-dev/check_marker_budget.py

# 5) upstream tracker evidence validation (U11 parity)
bash scripts-dev/blackout/validate_tracker_evidence.sh
```

## 5) Definition of completion for this prompt pack

This pack is considered complete when:

1. Every currently open Markdown checklist item is covered by one of R1–R4.
2. R1–R4 can be executed in independent PR waves with explicit validations.
3. Final closure report and this prompt pack reflect the same remaining-work counts.
