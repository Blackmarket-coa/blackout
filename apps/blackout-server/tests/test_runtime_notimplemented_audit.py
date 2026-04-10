# Copyright 2026 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from pathlib import Path

from tests.check_runtime_notimplemented import (
    NOT_IMPLEMENTED_ERROR_NAME,
    ROOT,
    SYNAPSE_DIR,
    iter_notimplemented_raises,
)


def test_synapse_has_no_runtime_notimplemented_raises() -> None:
    """Guard against introducing runtime Not-Implemented raise paths."""

    violations = []
    for py_file in sorted(SYNAPSE_DIR.rglob("*.py")):
        hits = iter_notimplemented_raises(py_file)
        for lineno, snippet in hits:
            violations.append(f"{py_file.relative_to(ROOT)}:{lineno}: {snippet}")

    assert violations == []


def test_dnsnotimplementederror_is_external_exception_reference_only() -> None:
    """Document that srv_resolver handles Twisted's DNS Not-Implemented type."""

    path = Path("synapse/http/federation/srv_resolver.py")
    source = path.read_text(encoding="utf-8")

    assert "DNSNotImplemented" "Error" in source
    assert f"raise {NOT_IMPLEMENTED_ERROR_NAME}(" not in source
