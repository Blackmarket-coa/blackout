import ast
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
NOT_IMPLEMENTED_ERROR_NAME = "NotImplemented" "Error"


def _synapse_files():
    return sorted((REPO_ROOT / "synapse").rglob("*.py"))


def _find_notimplemented_raises(path: Path) -> list[int]:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))

    hits = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Raise) or node.exc is None:
            continue

        exc = node.exc
        target = exc.func if isinstance(exc, ast.Call) else exc

        if isinstance(target, ast.Name) and target.id == NOT_IMPLEMENTED_ERROR_NAME:
            hits.append(node.lineno)
        elif (
            isinstance(target, ast.Attribute)
            and target.attr == NOT_IMPLEMENTED_ERROR_NAME
        ):
            hits.append(node.lineno)

    return hits


def test_synapse_has_no_raw_not_implemented_error_raises() -> None:
    offending = []
    for path in _synapse_files():
        hit_lines = _find_notimplemented_raises(path)
        if hit_lines:
            offending.append(
                f"{path.relative_to(REPO_ROOT).as_posix()}:{','.join(str(line) for line in hit_lines)}"
            )

    assert offending == []


def test_runtime_cache_placeholders_raise_runtime_error() -> None:
    expected_runtime_guards = {
        "synapse/storage/databases/main/end_to_end_keys.py": "raise RuntimeError(",
        "synapse/storage/databases/main/pusher.py": "raise RuntimeError(",
        "synapse/storage/databases/main/presence.py": "raise RuntimeError(",
        "synapse/storage/databases/main/keys.py": "raise RuntimeError(",
        "synapse/storage/databases/main/signatures.py": "raise RuntimeError(",
    }

    for rel_path, expected in expected_runtime_guards.items():
        text = (REPO_ROOT / rel_path).read_text(encoding="utf-8")
        assert expected in text
