"""Test-path bootstrap for blackout runtime tests.

Pytest can execute from environments where the repository root is not inserted
into ``sys.path`` during collection. Ensure local package imports remain stable.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
