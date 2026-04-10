# Copyright 2026 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

import re
from pathlib import Path
from typing import List

REQUIRED_RELEASE_FILES = (
    "release/train/checklist.md",
    "release/train/changelog.md",
    "release/train/image_provenance.json",
)

REQUIRED_CHECKLIST_SECTIONS = (
    "## Upstream Diff Review",
    "## CVE Review",
    "## Backport Plan",
)

REQUIRED_CHANGELOG_SECTIONS = (
    "## Fork Policy Changes",
    "## Runtime Defaults",
    "## Security Backports",
    "## Backport Tracking",
    "### Upstream patched commit IDs",
)


def validate_release_train_artifacts(repo_root: Path) -> List[str]:
    errors: List[str] = []

    for rel_path in REQUIRED_RELEASE_FILES:
        path = repo_root / rel_path
        if not path.exists():
            errors.append(f"Missing required release artifact: {rel_path}")

    checklist_path = repo_root / "release/train/checklist.md"
    if checklist_path.exists():
        checklist_text = checklist_path.read_text(encoding="utf-8")
        for heading in REQUIRED_CHECKLIST_SECTIONS:
            if heading not in checklist_text:
                errors.append(
                    f"release/train/checklist.md missing section heading: {heading}"
                )

    changelog_path = repo_root / "release/train/changelog.md"
    if changelog_path.exists():
        changelog_text = changelog_path.read_text(encoding="utf-8")
        for heading in REQUIRED_CHANGELOG_SECTIONS:
            if heading not in changelog_text:
                errors.append(
                    f"release/train/changelog.md missing section heading: {heading}"
                )

        # Ensure release notes explicitly track upstream patched commit ids.
        if not re.search(r"`[0-9a-f]{7,40}`", changelog_text):
            errors.append(
                "release/train/changelog.md missing upstream patched commit IDs "
                "(expected at least one backticked git commit hash in Security Backports)"
            )

    provenance_path = repo_root / "release/train/image_provenance.json"
    if provenance_path.exists():
        import json

        try:
            provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"release/train/image_provenance.json is invalid JSON: {exc}")
            return errors

        required_fields = (
            "source_revision",
            "upstream_base_revision",
            "build_timestamp_utc",
            "sbom_artifact_uri",
            "provenance_artifact_uri",
        )
        for field in required_fields:
            value = str(provenance.get(field, "")).strip()
            if not value:
                errors.append(
                    f"release/train/image_provenance.json missing required field: {field}"
                )

    return errors
