#!/usr/bin/env python3
# Copyright 2026 The Matrix.org Foundation C.I.C.

import sys
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(repo_root))

    from synapse.util.release_train import validate_release_train_artifacts

    errors = validate_release_train_artifacts(repo_root)
    if errors:
        print("Release train gate failed:")
        for error in errors:
            print(f" - {error}")
        return 1

    print("Release train gate passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
