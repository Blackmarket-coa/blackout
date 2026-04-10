# Copyright 2026 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

import re
from typing import Iterable, List, Set

RISKY_PATH_PREFIXES = (
    "synapse/api/auth",
    "synapse/config/auth.py",
    "synapse/handlers/federation",
    "synapse/federation/",
    "synapse/crypto/",
    "synapse/rest/key/",
)


def _is_risky_path(path: str) -> bool:
    return path.startswith(RISKY_PATH_PREFIXES)


def extract_divergence_markers(checklist_text: str) -> Set[str]:
    markers: Set[str] = set()
    for line in checklist_text.splitlines():
        m = re.match(r"^- \[x\] `([^`\n]+)`\s*$", line.strip())
        if m:
            markers.add(m.group(1))
            continue

        m = re.match(r"^- \[x\] ([^\n`]+)\s*$", line.strip())
        if m:
            markers.add(m.group(1).strip())
    return markers


def validate_risky_changes_have_markers(
    changed_files: Iterable[str], checklist_text: str
) -> List[str]:
    errors: List[str] = []
    risky_changes = sorted(path for path in changed_files if _is_risky_path(path))
    if not risky_changes:
        return errors

    if "## Divergence Risk Markers" not in checklist_text:
        errors.append(
            "release/train/checklist.md missing section heading: ## Divergence Risk Markers"
        )
        return errors

    # extract second capture group from regex tuples
    marked_paths = extract_divergence_markers(checklist_text)

    for path in risky_changes:
        if path not in marked_paths:
            errors.append(
                f"risky changed path missing checklist marker entry: {path} "
                "(expected '- [x] `path`' under '## Divergence Risk Markers')"
            )

    return errors
