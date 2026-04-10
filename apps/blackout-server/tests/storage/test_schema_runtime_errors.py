# Copyright 2026 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.

import importlib.util
from pathlib import Path
from types import ModuleType
from unittest.mock import Mock

from tests import unittest


class SchemaRuntimeErrorTestCase(unittest.TestCase):
    def _load_module(self, rel_path: str) -> ModuleType:
        module_path = Path(__file__).resolve().parents[2] / rel_path
        spec = importlib.util.spec_from_file_location(module_path.stem, module_path)
        assert spec is not None
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)
        return module

    def test_delta68_unknown_engine_raises_runtime_error(self) -> None:
        mod = self._load_module(
            "synapse/storage/schema/main/delta/68/05partial_state_rooms_triggers.py"
        )

        with self.assertRaises(RuntimeError):
            mod.run_create(Mock(), Mock())

    def test_delta74_unknown_engine_raises_runtime_error(self) -> None:
        mod = self._load_module(
            "synapse/storage/schema/main/delta/74/04_membership_tables_event_stream_ordering_triggers.py"
        )

        with self.assertRaises(RuntimeError):
            mod.run_create(Mock(), Mock())
