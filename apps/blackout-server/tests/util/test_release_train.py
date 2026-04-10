# Copyright 2026 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from pathlib import Path

from synapse.util.release_train import validate_release_train_artifacts

from tests.unittest import TestCase


class ReleaseTrainGateTestCase(TestCase):
    def _write(self, root: Path, rel_path: str, content: str) -> None:
        target = root / rel_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    def test_gate_passes_when_required_files_and_sections_exist(self) -> None:
        root = Path(self.mktemp())

        self._write(
            root,
            "release/train/checklist.md",
            "# Checklist\n## Upstream Diff Review\n## CVE Review\n## Backport Plan\n",
        )
        self._write(
            root,
            "release/train/changelog.md",
            (
                "# Changelog\n## Fork Policy Changes\n## Runtime Defaults\n"
                "## Security Backports\n## Backport Tracking\n"
                "### Upstream patched commit IDs\n- `deadbeef`\n"
            ),
        )
        self._write(
            root,
            "release/train/image_provenance.json",
            (
                '{'
                '"source_revision":"abc1234",'
                '"upstream_base_revision":"def5678",'
                '"build_timestamp_utc":"2026-03-19T00:00:00Z",'
                '"sbom_artifact_uri":"https://example/sbom",'
                '"provenance_artifact_uri":"https://example/prov"'
                '}'
            ),
        )

        self.assertEqual(validate_release_train_artifacts(root), [])

    def test_gate_fails_when_checklist_is_missing(self) -> None:
        root = Path(self.mktemp())
        self._write(
            root,
            "release/train/changelog.md",
            (
                "# Changelog\n## Fork Policy Changes\n## Runtime Defaults\n"
                "## Security Backports\n## Backport Tracking\n"
                "### Upstream patched commit IDs\n- `deadbeef`\n"
            ),
        )

        errors = validate_release_train_artifacts(root)
        self.assertIn(
            "Missing required release artifact: release/train/checklist.md", errors
        )
        self.assertIn(
            "Missing required release artifact: release/train/image_provenance.json",
            errors,
        )

    def test_gate_fails_when_required_section_missing(self) -> None:
        root = Path(self.mktemp())
        self._write(
            root,
            "release/train/checklist.md",
            "# Checklist\n## Upstream Diff Review\n## Backport Plan\n",
        )
        self._write(
            root,
            "release/train/changelog.md",
            "# Changelog\n## Fork Policy Changes\n## Runtime Defaults\n",
        )
        self._write(
            root,
            "release/train/image_provenance.json",
            (
                '{'
                '"source_revision":"abc1234",'
                '"upstream_base_revision":"def5678",'
                '"build_timestamp_utc":"2026-03-19T00:00:00Z",'
                '"sbom_artifact_uri":"https://example/sbom",'
                '"provenance_artifact_uri":"https://example/prov"'
                '}'
            ),
        )

        errors = validate_release_train_artifacts(root)
        self.assertIn(
            "release/train/checklist.md missing section heading: ## CVE Review", errors
        )
        self.assertIn(
            "release/train/changelog.md missing section heading: ## Security Backports",
            errors,
        )

    def test_gate_fails_when_upstream_commit_ids_are_missing(self) -> None:
        root = Path(self.mktemp())
        self._write(
            root,
            "release/train/checklist.md",
            "# Checklist\n## Upstream Diff Review\n## CVE Review\n## Backport Plan\n",
        )
        self._write(
            root,
            "release/train/changelog.md",
            (
                "# Changelog\n## Fork Policy Changes\n## Runtime Defaults\n"
                "## Security Backports\n## Backport Tracking\n"
                "### Upstream patched commit IDs\n- none listed\n"
            ),
        )
        self._write(
            root,
            "release/train/image_provenance.json",
            (
                '{'
                '"source_revision":"abc1234",'
                '"upstream_base_revision":"def5678",'
                '"build_timestamp_utc":"2026-03-19T00:00:00Z",'
                '"sbom_artifact_uri":"https://example/sbom",'
                '"provenance_artifact_uri":"https://example/prov"'
                '}'
            ),
        )

        errors = validate_release_train_artifacts(root)
        self.assertIn(
            "release/train/changelog.md missing upstream patched commit IDs "
            "(expected at least one backticked git commit hash in Security Backports)",
            errors,
        )

    def test_gate_fails_when_image_provenance_fields_missing(self) -> None:
        root = Path(self.mktemp())
        self._write(
            root,
            "release/train/checklist.md",
            "# Checklist\n## Upstream Diff Review\n## CVE Review\n## Backport Plan\n",
        )
        self._write(
            root,
            "release/train/changelog.md",
            (
                "# Changelog\n## Fork Policy Changes\n## Runtime Defaults\n"
                "## Security Backports\n## Backport Tracking\n"
                "### Upstream patched commit IDs\n- `deadbeef`\n"
            ),
        )
        self._write(root, "release/train/image_provenance.json", '{"source_revision":"abc"}')
        errors = validate_release_train_artifacts(root)
        self.assertIn(
            "release/train/image_provenance.json missing required field: sbom_artifact_uri",
            errors,
        )
