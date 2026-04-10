"""Audit tracker checklists and incomplete-work markers.

This script is intentionally lightweight so it can be run in CI or locally to
produce a human-readable checkpoint report.
"""

from __future__ import annotations

import collections
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
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
TRACKER_GLOB = "*tracker*.md"
EXCLUDED_MARKER_PATHS = {
    "INCOMPLETE_WORK.md",
    "docs/marker_inventory.csv",
    "docs/tracker_todo_fixme_report.md",
    "scripts-dev/check_trackers_and_markers.py",
}
REPORT_PATH = Path("docs/tracker_todo_fixme_report.md")


@dataclass
class TrackerSummary:
    path: Path
    checked: int
    unchecked: int


CHECKED_RE = re.compile(r"^\s*[-*]\s*\[x\]\s+", re.IGNORECASE)
UNCHECKED_RE = re.compile(r"^\s*[-*]\s*\[\s\]\s+")


def _tracker_summaries() -> list[TrackerSummary]:
    summaries: list[TrackerSummary] = []
    for path in sorted(Path("docs").rglob(TRACKER_GLOB)):
        if path == REPORT_PATH:
            continue
        checked = 0
        unchecked = 0
        for line in path.read_text(encoding="utf-8").splitlines():
            if CHECKED_RE.match(line):
                checked += 1
            elif UNCHECKED_RE.match(line):
                unchecked += 1
        summaries.append(
            TrackerSummary(path=path, checked=checked, unchecked=unchecked)
        )
    return summaries


def _marker_lines() -> list[tuple[str, int, str]]:
    out = subprocess.check_output(["rg", "-n", MARKER_REGEX, "."], text=True)
    lines: list[tuple[str, int, str]] = []
    for raw in out.splitlines():
        path, lineno, text = raw.split(":", 2)
        if path.startswith("./"):
            path = path[2:]
        if path in EXCLUDED_MARKER_PATHS:
            continue
        lines.append((path, int(lineno), text.strip()))
    return lines


def main() -> int:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
    tracker_summaries = _tracker_summaries()

    markers = _marker_lines()
    by_root = collections.Counter(path.split("/", 1)[0] for path, _, _ in markers)
    by_keyword = collections.Counter(
        keyword
        for _, _, text in markers
        for keyword in MARKER_KEYWORDS
        if keyword in text
    )

    top_marker_files = collections.Counter(path for path, _, _ in markers).most_common(
        15
    )

    report_lines: list[str] = [
        "# Tracker / marker audit report",
        "",
        f"Generated: **{now}**",
        "",
        "## Tracker checklist status",
        "",
        "| Tracker | Checked | Unchecked | Total |",
        "|---|---:|---:|---:|",
    ]

    for summary in tracker_summaries:
        total = summary.checked + summary.unchecked
        report_lines.append(
            f"| `{summary.path.as_posix()}` | {summary.checked} | {summary.unchecked} | {total} |"
        )

    report_lines.extend(
        [
            "",
            "## Incomplete-work markers",
            "",
            f"- Total markers (excluding generated inventory/report files): **{len(markers)}**",
            "",
            "### By top-level path",
            "",
        ]
    )

    for root, count in by_root.most_common():
        report_lines.append(f"- `{root}/`: {count}")

    report_lines.extend(["", "### By keyword", ""])
    for key, count in by_keyword.most_common():
        report_lines.append(f"- `{key}`: {count}")

    report_lines.extend(["", "### Top files by marker count", ""])
    for path, count in top_marker_files:
        report_lines.append(f"- `{path}`: {count}")

    REPORT_PATH.write_text("\n".join(report_lines) + "\n", encoding="utf-8")
    print(f"Wrote {REPORT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
