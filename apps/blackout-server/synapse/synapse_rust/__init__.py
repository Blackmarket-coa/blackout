"""Python fallback implementations for optional rust bindings.

These shims keep source-tree executions and constrained environments usable when
compiled rust extensions are unavailable.
"""

from __future__ import annotations


def get_rust_file_digest() -> str:
    """Return a placeholder digest when rust bindings are unavailable."""

    return ""


def reset_logging_config() -> None:
    """Rust logging bridge reset hook fallback."""

    return
