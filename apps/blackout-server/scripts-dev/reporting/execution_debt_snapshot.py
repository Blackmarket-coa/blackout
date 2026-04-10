#!/usr/bin/env python3
"""Summarize execution debt from the backend plan tracker.

Parses checklist lines in docs/development/blackout_backend_plan_tracker.md and emits
counts by scope/status, owner, and due date.
"""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

TRACKER = Path("docs/development/blackout_backend_plan_tracker.md")

LINE_RE = re.compile(
    r"^\s*- \[(?P<check>[ x~!])]\s*\[(?P<scope>[^\]]+)]\s*(?P<text>.*)$"
)
OWNER_RE = re.compile(r"owner:\s*([^;\)]+)")
DUE_RE = re.compile(r"due:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})")


def parse() -> tuple[Counter[str], Counter[str], Counter[str], Counter[str]]:
    status_counts: Counter[str] = Counter()
    scope_counts: Counter[str] = Counter()
    owner_counts: Counter[str] = Counter()
    due_counts: Counter[str] = Counter()

    for line in TRACKER.read_text(encoding="utf-8").splitlines():
        m = LINE_RE.match(line)
        if not m:
            continue

        check = m.group("check")
        scope = m.group("scope").strip()
        text = m.group("text")

        check_map = {" ": "open", "x": "done", "~": "in_progress", "!": "blocked"}
        status_counts[check_map[check]] += 1
        scope_counts[scope] += 1

        owner_match = OWNER_RE.search(text)
        if owner_match:
            owner_counts[owner_match.group(1).strip()] += 1

        due_match = DUE_RE.search(text)
        if due_match:
            due_counts[due_match.group(1)] += 1

    return status_counts, scope_counts, owner_counts, due_counts


def top_lines(counter: Counter[str], limit: int = 8) -> list[str]:
    return [f"- {k}: {v}" for k, v in counter.most_common(limit)]


def main() -> None:
    status, scope, owner, due = parse()

    print("# Execution Debt Snapshot")
    print(f"- Source: `{TRACKER}`")
    print("\n## Checklist status")
    for line in top_lines(status, 8):
        print(line)

    print("\n## Scope labels")
    for line in top_lines(scope, 8):
        print(line)

    print("\n## Top owners by open load")
    for line in top_lines(owner, 10):
        print(line)

    print("\n## Upcoming due dates")
    for line in sorted(due.items()):
        print(f"- {line[0]}: {line[1]}")


if __name__ == "__main__":
    main()
