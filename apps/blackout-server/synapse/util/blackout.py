import base64
import json
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Tuple

import jsonschema

_HEX_RE = re.compile(r"^[0-9a-fA-F]+$")
_INLINE_SIGNAL_PAYLOAD_FIELDS = ("sdp_offer", "sdp_answer", "ice_candidates")
BLACKOUT_SIGNAL_SCHEMA_VERSION = 2
BLACKOUT_SIGNAL_MAX_PAYLOAD_BYTES = 64 * 1024
_ALLOWED_SIGNAL_CONTENT_CLASSES = (
    "webrtc-session",
    "chunk-announcement",
    "offline-retrieval",
    "control",
)

_BLACKOUT_SIGNAL_CONTENT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["schema_version", "message_metadata"],
    "properties": {
        "schema_version": {"const": BLACKOUT_SIGNAL_SCHEMA_VERSION},
        "ice_candidates": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["candidate"],
                "properties": {
                    "candidate": {"type": "string", "minLength": 1},
                    "sdpMLineIndex": {"type": "integer"},
                    "sdpMid": {"type": "string"},
                },
                "additionalProperties": False,
            },
        },
        "sdp_offer": {
            "type": "object",
            "required": ["type", "sdp"],
            "properties": {
                "type": {"const": "offer"},
                "sdp": {"type": "string", "minLength": 1},
            },
            "additionalProperties": False,
        },
        "sdp_answer": {
            "type": "object",
            "required": ["type", "sdp"],
            "properties": {
                "type": {"const": "answer"},
                "sdp": {"type": "string", "minLength": 1},
            },
            "additionalProperties": False,
        },
        "message_metadata": {
            "type": "object",
            "required": ["message_id", "sender_key_id", "content_class"],
            "properties": {
                "message_id": {"type": "string", "minLength": 1},
                "sender_key_id": {"type": "string", "minLength": 1},
                "content_class": {"enum": list(_ALLOWED_SIGNAL_CONTENT_CLASSES)},
                "sender_key": {"type": "string"},
                "topology_hints": {
                    "type": "array",
                    "items": {"type": "string", "minLength": 1},
                },
            },
            "additionalProperties": False,
        },
        "chunk_announcements": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["chunk_id", "chunk_hash"],
                "properties": {
                    "chunk_id": {"type": "string", "minLength": 1},
                    "chunk_hash": {"type": "string", "minLength": 1},
                    "merkle_root": {"type": "string", "minLength": 1},
                    "replication_factor": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 10,
                    },
                    "replica_hints": {
                        "type": "array",
                        "maxItems": 20,
                        "items": {"type": "string", "minLength": 1},
                    },
                },
                "additionalProperties": False,
            },
        },
        "offline_retrieval": {
            "type": "object",
            "required": ["manifest_id", "external_fetch_required"],
            "properties": {
                "manifest_id": {"type": "string"},
                "external_fetch_required": {"type": "boolean"},
            },
            "additionalProperties": False,
        },
        "blackout_stego": {
            "type": "object",
            "required": ["carrier", "payload_hash", "policy_id"],
            "properties": {
                "carrier": {"enum": ["image", "audio", "video"]},
                "payload_hash": {"type": "string", "minLength": 16},
                "policy_id": {"type": "string", "minLength": 1},
                "ttl_hours": {"type": "integer", "minimum": 1, "maximum": 72},
            },
            "additionalProperties": False,
        },
        "self_destruct_after": {"type": "integer"},
        "org.matrix.self_destruct_after": {"type": "integer"},
    },
}


@dataclass(frozen=True)
class BlackoutSignalValidationResult:
    missing_redundancy_metadata: bool = False
    invalid_redundancy_metadata: bool = False
    redundancy_mismatch_detected: bool = False
    declared_replication_factors: Tuple[int, ...] = ()


def _is_fixed_length_hash(value: Any) -> bool:
    if not isinstance(value, str):
        return False

    if len(value) == 64 and _HEX_RE.fullmatch(value):
        return True

    padded = value + ("=" * ((4 - (len(value) % 4)) % 4))
    try:
        decoded = base64.b64decode(padded, validate=True)
    except Exception:
        return False

    return len(decoded) == 32


def _to_plain_json(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(k): _to_plain_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_to_plain_json(v) for v in value]
    return value


def _validate_message_metadata(metadata: Any) -> Dict[str, Any]:
    if not isinstance(metadata, dict):
        raise ValueError("message_metadata must be a JSON object")

    for required in ("message_id", "sender_key_id"):
        if (
            not isinstance(metadata.get(required), str)
            or not metadata[required].strip()
        ):
            raise ValueError(f"message_metadata.{required} must be a non-empty string")

    sender_key = metadata.get("sender_key")
    if sender_key is not None and not isinstance(sender_key, str):
        raise ValueError("message_metadata.sender_key must be a string when present")

    topology_hints = metadata.get("topology_hints")
    if topology_hints is not None:
        if not isinstance(topology_hints, list) or any(
            not isinstance(h, str) or not h.strip() for h in topology_hints
        ):
            raise ValueError(
                "message_metadata.topology_hints must be a list of non-empty strings"
            )

    return metadata


def _validate_chunk_announcements(
    chunk_announcements: Any,
) -> BlackoutSignalValidationResult:
    if chunk_announcements is None:
        return BlackoutSignalValidationResult()

    if not isinstance(chunk_announcements, list):
        raise ValueError("chunk_announcements must be a list")

    missing_redundancy_metadata = False
    invalid_redundancy_metadata = False
    redundancy_mismatch_detected = False
    declared_replication_factors: List[int] = []
    for idx, chunk in enumerate(chunk_announcements):
        prefix = f"chunk_announcements[{idx}]"
        if not isinstance(chunk, dict):
            raise ValueError(f"{prefix} must be a JSON object")

        if not isinstance(chunk.get("chunk_id"), str) or not chunk["chunk_id"].strip():
            raise ValueError(f"{prefix}.chunk_id must be a non-empty string")

        if not _is_fixed_length_hash(chunk.get("chunk_hash")):
            raise ValueError(
                f"{prefix}.chunk_hash must be a fixed-length hex/base64 hash"
            )

        merkle_root = chunk.get("merkle_root")
        if merkle_root is not None and not _is_fixed_length_hash(merkle_root):
            raise ValueError(
                f"{prefix}.merkle_root must be a fixed-length hex/base64 hash"
            )

        replication_factor = chunk.get("replication_factor")
        replica_hints = chunk.get("replica_hints")
        if replication_factor is None:
            missing_redundancy_metadata = True
        elif isinstance(replication_factor, int):
            declared_replication_factors.append(replication_factor)

        if isinstance(replication_factor, int) and isinstance(replica_hints, list):
            if len(replica_hints) < replication_factor:
                invalid_redundancy_metadata = True
                redundancy_mismatch_detected = True

    return BlackoutSignalValidationResult(
        missing_redundancy_metadata=missing_redundancy_metadata,
        invalid_redundancy_metadata=invalid_redundancy_metadata,
        redundancy_mismatch_detected=redundancy_mismatch_detected,
        declared_replication_factors=tuple(declared_replication_factors),
    )


def validate_blackout_signal_content(content: Any) -> BlackoutSignalValidationResult:
    plain_content = _to_plain_json(content)
    payload_bytes = len(
        json.dumps(plain_content, ensure_ascii=False, separators=(",", ":")).encode(
            "utf-8"
        )
    )
    if payload_bytes > BLACKOUT_SIGNAL_MAX_PAYLOAD_BYTES:
        raise ValueError(
            "invalid m.blackout.signal content: payload exceeds %d bytes"
            % (BLACKOUT_SIGNAL_MAX_PAYLOAD_BYTES,)
        )

    try:
        jsonschema.validate(plain_content, _BLACKOUT_SIGNAL_CONTENT_SCHEMA)
    except jsonschema.ValidationError as e:
        raise ValueError(f"invalid m.blackout.signal content: {e.message}")

    _validate_message_metadata(plain_content.get("message_metadata"))
    content_class = plain_content["message_metadata"].get("content_class")
    if content_class == "webrtc-session" and not any(
        plain_content.get(field) is not None
        for field in ("sdp_offer", "sdp_answer", "ice_candidates")
    ):
        raise ValueError(
            "invalid m.blackout.signal content: webrtc-session requires signaling payload fields"
        )
    if (
        content_class == "chunk-announcement"
        and plain_content.get("chunk_announcements") is None
    ):
        raise ValueError(
            "invalid m.blackout.signal content: chunk-announcement requires chunk_announcements"
        )
    if (
        content_class == "offline-retrieval"
        and plain_content.get("offline_retrieval") is None
    ):
        raise ValueError(
            "invalid m.blackout.signal content: offline-retrieval requires offline_retrieval metadata"
        )

    if (
        plain_content.get("sdp_offer") is not None
        and plain_content.get("sdp_answer") is not None
    ):
        raise ValueError(
            "invalid m.blackout.signal content: only one of sdp_offer or sdp_answer is allowed"
        )

    ice_candidates = plain_content.get("ice_candidates")
    if isinstance(ice_candidates, list):
        for idx, candidate in enumerate(ice_candidates):
            sdp_mid = candidate.get("sdpMid")
            if sdp_mid is not None and (
                not isinstance(sdp_mid, str) or not sdp_mid.strip()
            ):
                raise ValueError(
                    "invalid m.blackout.signal content: ice_candidates[%d].sdpMid must be a non-empty string"
                    % (idx,)
                )

    return _validate_chunk_announcements(plain_content.get("chunk_announcements"))


def strip_inline_payload_from_signal_content(content: Any) -> bool:
    """Strip inline signaling payload fields from m.blackout.signal content.

    Returns:
        True if inline payload fields were present and stripped.

    Raises:
        ValueError if inline payload fields are present without metadata-only
        offline retrieval markers.
    """

    if not isinstance(content, dict):
        raise ValueError("invalid m.blackout.signal content: must be a JSON object")

    has_inline_payload = any(key in content for key in _INLINE_SIGNAL_PAYLOAD_FIELDS)
    if not has_inline_payload:
        return False

    offline_retrieval = content.get("offline_retrieval")
    if not isinstance(offline_retrieval, dict):
        raise ValueError(
            "invalid m.blackout.signal content: offline_retrieval is required when inline signaling payload is present"
        )

    if offline_retrieval.get("external_fetch_required") is not True:
        raise ValueError(
            "invalid m.blackout.signal content: offline_retrieval.external_fetch_required must be true when inline signaling payload is present"
        )

    for payload_key in _INLINE_SIGNAL_PAYLOAD_FIELDS:
        content.pop(payload_key, None)

    return True


def extract_sender_key_identifiers_from_signal_content(content: Any) -> List[str]:
    if not isinstance(content, dict):
        return []

    message_metadata = content.get("message_metadata")
    if not isinstance(message_metadata, dict):
        return []

    key_identifiers: List[str] = []
    sender_key_id = message_metadata.get("sender_key_id")
    sender_key = message_metadata.get("sender_key")

    if isinstance(sender_key_id, str):
        key_identifiers.append(sender_key_id)
    if isinstance(sender_key, str):
        key_identifiers.append(sender_key)

    return key_identifiers
    content_class = metadata.get("content_class")
    if content_class not in _ALLOWED_SIGNAL_CONTENT_CLASSES:
        raise ValueError(
            "message_metadata.content_class must be one of: %s"
            % (", ".join(_ALLOWED_SIGNAL_CONTENT_CLASSES),)
        )
