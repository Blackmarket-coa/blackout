#!/usr/bin/env python3

import sys
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(repo_root))

    from synapse.util.hosting_smoke import run_hosting_smoke_checks

    errors = run_hosting_smoke_checks()
    if errors:
        print("Hosting smoke checks failed:")
        for error in errors:
            print(f" - {error}")
        return 1

    print("Hosting smoke checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
