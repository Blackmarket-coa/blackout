# Copyright 2026 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from synapse.util.divergence_guardrails import validate_risky_changes_have_markers

from tests.unittest import TestCase


class DivergenceGuardrailsTestCase(TestCase):
    def test_non_risky_changes_do_not_require_markers(self) -> None:
        checklist = "# Checklist\n"
        errors = validate_risky_changes_have_markers(
            ["docs/upgrade.md", "tests/util/test_release_train.py"], checklist
        )
        self.assertEqual(errors, [])

    def test_missing_divergence_marker_section_fails(self) -> None:
        checklist = "# Checklist\n"
        errors = validate_risky_changes_have_markers(
            ["synapse/federation/transport/server/__init__.py"], checklist
        )
        self.assertIn(
            "release/train/checklist.md missing section heading: ## Divergence Risk Markers",
            errors,
        )

    def test_missing_marker_for_risky_path_fails(self) -> None:
        checklist = "## Divergence Risk Markers\n- [x] `synapse/api/auth/base.py`\n"
        errors = validate_risky_changes_have_markers(
            ["synapse/federation/transport/server/__init__.py"], checklist
        )
        self.assertEqual(len(errors), 1)
        self.assertIn("risky changed path missing checklist marker entry", errors[0])

    def test_marker_for_risky_path_passes(self) -> None:
        checklist = (
            "## Divergence Risk Markers\n"
            "- [x] `synapse/federation/transport/server/__init__.py`\n"
        )
        errors = validate_risky_changes_have_markers(
            ["synapse/federation/transport/server/__init__.py"], checklist
        )
        self.assertEqual(errors, [])
