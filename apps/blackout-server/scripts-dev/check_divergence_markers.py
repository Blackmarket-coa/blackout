#!/usr/bin/env python3

import subprocess
import sys
from pathlib import Path
from typing import List


def _changed_files(repo_root: Path) -> List[str]:
    # Prefer merge-base against origin/develop; fallback to previous commit.
    candidates = ["origin/develop...HEAD", "HEAD~1..HEAD"]
    for rev in candidates:
        proc = subprocess.run(
            ["git", "diff", "--name-only", rev],
            cwd=repo_root,
            capture_output=True,
            text=True,
        )
        if proc.returncode == 0:
            files = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
            return files
    return []


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(repo_root))

    from synapse.util.divergence_guardrails import validate_risky_changes_have_markers

    checklist_path = repo_root / "release/train/checklist.md"
    checklist_text = (
        checklist_path.read_text(encoding="utf-8") if checklist_path.exists() else ""
    )
    errors = validate_risky_changes_have_markers(_changed_files(repo_root), checklist_text)

    if errors:
        print("Divergence marker check failed:")
        for error in errors:
            print(f" - {error}")
        return 1

    print("Divergence marker check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
