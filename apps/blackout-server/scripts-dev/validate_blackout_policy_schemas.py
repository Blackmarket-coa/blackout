#!/usr/bin/env python3
"""Validate Blackout policy schemas and example documents.

This script intentionally uses stdlib only so it can run in minimal CI images.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

SCHEMA_DIR = Path("docs/policy_schemas")
EXAMPLE_DIR = Path(".ci/blackout_policy_examples")

SCHEMA_FILES = {
    "blackout_cell_space": SCHEMA_DIR / "blackout_cell_space.schema.json",
    "blackout_dead_drop_room": SCHEMA_DIR / "blackout_dead_drop_room.schema.json",
    "blackout_announcement_room": SCHEMA_DIR / "blackout_announcement_room.schema.json",
}

EXAMPLE_FILES = {
    "blackout_cell_space": EXAMPLE_DIR / "blackout_cell_space.example.json",
    "blackout_dead_drop_room": EXAMPLE_DIR / "blackout_dead_drop_room.example.json",
    "blackout_announcement_room": EXAMPLE_DIR
    / "blackout_announcement_room.example.json",
}


class ValidationError(Exception):
    pass


def _load_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        raise ValidationError(f"Missing required file: {path}")
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _validate_schema_shape(name: str, schema: Dict[str, Any]) -> None:
    for key in ("$schema", "$id", "title", "type", "required", "properties"):
        if key not in schema:
            raise ValidationError(f"{name}: missing schema key '{key}'")

    if schema["type"] != "object":
        raise ValidationError(f"{name}: schema type must be 'object'")

    required = schema["required"]
    properties = schema["properties"]
    if not isinstance(required, list) or not isinstance(properties, dict):
        raise ValidationError(f"{name}: invalid required/properties structure")

    missing = [prop for prop in required if prop not in properties]
    if missing:
        raise ValidationError(
            f"{name}: required properties missing from schema properties: {missing}"
        )


def _validate_type(value: Any, expected: str) -> bool:
    if expected == "string":
        return isinstance(value, str)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "array":
        return isinstance(value, list)
    if expected == "object":
        return isinstance(value, dict)
    return False


def _validate_instance_against_schema(
    name: str, schema: Dict[str, Any], instance: Dict[str, Any]
) -> None:
    required: List[str] = schema["required"]
    properties: Dict[str, Dict[str, Any]] = schema["properties"]

    for key in required:
        if key not in instance:
            raise ValidationError(f"{name}: example missing required key '{key}'")

    if schema.get("additionalProperties") is False:
        extra_keys = [k for k in instance.keys() if k not in properties]
        if extra_keys:
            raise ValidationError(f"{name}: unexpected keys in example: {extra_keys}")

    for key, value in instance.items():
        prop_schema = properties.get(key)
        if not prop_schema:
            continue

        expected_type = prop_schema.get("type")
        if expected_type and not _validate_type(value, expected_type):
            raise ValidationError(
                f"{name}: key '{key}' has wrong type; expected {expected_type}"
            )

        enum_values = prop_schema.get("enum")
        if enum_values is not None and value not in enum_values:
            raise ValidationError(
                f"{name}: key '{key}' must be one of {enum_values}, got {value!r}"
            )

        if expected_type == "integer":
            minimum = prop_schema.get("minimum")
            maximum = prop_schema.get("maximum")
            if minimum is not None and value < minimum:
                raise ValidationError(
                    f"{name}: key '{key}'={value} is less than minimum {minimum}"
                )
            if maximum is not None and value > maximum:
                raise ValidationError(
                    f"{name}: key '{key}'={value} exceeds maximum {maximum}"
                )

        if expected_type == "array":
            items_schema = prop_schema.get("items", {})
            for idx, item in enumerate(value):
                item_type = items_schema.get("type")
                if item_type and not _validate_type(item, item_type):
                    raise ValidationError(
                        f"{name}: key '{key}[{idx}]' has wrong type; expected {item_type}"
                    )
                item_enum = items_schema.get("enum")
                if item_enum is not None and item not in item_enum:
                    raise ValidationError(
                        f"{name}: key '{key}[{idx}]' not in allowed enum {item_enum}"
                    )
            if prop_schema.get("uniqueItems") and len(set(value)) != len(value):
                raise ValidationError(f"{name}: key '{key}' must contain unique values")


def _validate_cross_field_rules(name: str, instance: Dict[str, Any]) -> None:
    if name == "blackout_dead_drop_room":
        if instance.get("retention_ttl_hours", 0) <= 0:
            raise ValidationError(
                "blackout_dead_drop_room: retention_ttl_hours must be > 0"
            )

    if name == "blackout_announcement_room":
        if instance.get("fanout_mode") == "delayed_window":
            min_s = instance.get("delayed_fanout_min_seconds")
            max_s = instance.get("delayed_fanout_max_seconds")
            if min_s is None or max_s is None:
                raise ValidationError(
                    "blackout_announcement_room: delayed fanout requires min/max seconds"
                )
            if min_s > max_s:
                raise ValidationError(
                    "blackout_announcement_room: delayed fanout min cannot exceed max"
                )
            if not instance.get("rollback_procedure_ref"):
                raise ValidationError(
                    "blackout_announcement_room: rollback_procedure_ref is required"
                )


def main() -> int:
    for schema_name, schema_path in SCHEMA_FILES.items():
        schema = _load_json(schema_path)
        _validate_schema_shape(schema_name, schema)

        example = _load_json(EXAMPLE_FILES[schema_name])
        _validate_instance_against_schema(schema_name, schema, example)
        _validate_cross_field_rules(schema_name, example)

    print("Blackout Phase 0 policy schemas: validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
