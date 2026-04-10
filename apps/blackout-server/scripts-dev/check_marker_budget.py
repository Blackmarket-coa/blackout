#!/usr/bin/env python3
"""Check the repository's incomplete-work marker budget."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

MARKER_KEYWORDS = (
    "TO" "DO",
    "FIX" "ME",
    "TB" "D",
    "XX" "X",
    "HA" "CK",
    "NotImplemented" "Error",
    "TO" "DO_test_",
)
MARKER_REGEX = "|".join(MARKER_KEYWORDS)
BUDGET_FILE = Path(".ci/marker_budget.json")
EXCLUDED_PATHS = {
    "INCOMPLETE_WORK.md",
    "docs/marker_inventory.csv",
    "docs/tracker_todo_fixme_report.md",
    "scripts-dev/check_trackers_and_markers.py",
}


def _marker_count() -> int:
    out = subprocess.check_output(["rg", "-n", MARKER_REGEX, "."], text=True)
    count = 0
    for line in out.splitlines():
        path = line.split(":", 1)[0]
        if path.startswith("./"):
            path = path[2:]
        if path in EXCLUDED_PATHS:
            continue
        count += 1
    return count


def main() -> int:
    budget = json.loads(BUDGET_FILE.read_text())
    max_markers = int(budget["max_total_markers"])
    current = _marker_count()

    if current > max_markers:
        print(
            f"Marker budget exceeded: current={current}, budget={max_markers}. "
            "Reduce incomplete-work markers before merging.",
            file=sys.stderr,
        )
        return 1

    print(f"Marker budget check passed: current={current}, budget={max_markers}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
