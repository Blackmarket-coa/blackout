#!/usr/bin/env python3

import os
import sys
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(repo_root))

    from synapse.util.managed_hosting import run_readiness_checks

    errors = run_readiness_checks(os.environ)
    if errors:
        print("Managed readiness integration smoke failed:")
        for error in errors:
            print(f" - {error}")
        return 1

    print("Managed readiness integration smoke passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
