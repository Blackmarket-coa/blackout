# Copyright 2026 Blackout
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import ast
from pathlib import Path
from typing import Set

from tests import unittest

REPO_ROOT = Path(__file__).resolve().parents[2]
DELTA_78_FILE = (
    REPO_ROOT
    / "synapse"
    / "storage"
    / "schema"
    / "main"
    / "delta"
    / "78"
    / "03_remove_unused_indexes_user_filters.py"
)
PREPARE_DATABASE_FILE = REPO_ROOT / "synapse" / "storage" / "prepare_database.py"


def _functions_in_file(path: Path) -> Set[str]:
    module = ast.parse(path.read_text())
    return {
        node.name
        for node in module.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }


class Delta78UserFiltersMigrationTestCase(unittest.TestCase):
    def test_delta_exposes_run_upgrade_hook(self) -> None:
        """Regression test for accidentally naming the hook `run_update`."""

        functions = _functions_in_file(DELTA_78_FILE)

        self.assertIn("run_upgrade", functions)
        self.assertNotIn("run_update", functions)

    def test_prepare_database_uses_run_upgrade_for_python_deltas(self) -> None:
        """Verify upgrade flow dispatches Python delta hooks via `run_upgrade`."""

        source = PREPARE_DATABASE_FILE.read_text()

        self.assertIn('hasattr(module, "run_upgrade")', source)
        self.assertIn("module.run_upgrade(cur, database_engine, config=config)", source)
