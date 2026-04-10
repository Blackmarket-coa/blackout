from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import ValidationError, validate


SCHEMA_DIR = Path("docs/policy_schemas")


def _load_schema(name: str) -> dict:
    return json.loads((SCHEMA_DIR / name).read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    ("schema_name", "valid_payload", "invalid_payload"),
    [
        (
            "blackout_signal_stego.schema.json",
            {
                "carrier": "image",
                "payload_hash": "abcdef1234567890",
                "policy_id": "policy-1",
                "ttl_hours": 24,
            },
            {"carrier": "text", "payload_hash": "short", "policy_id": ""},
        ),
        (
            "blackout_governance_attestation.schema.json",
            {
                "proposal_id": "p1",
                "decision": "accepted",
                "attested_by": "@mod:test",
                "attestation_ref": "sig:abc",
            },
            {"proposal_id": "p1", "decision": "accepted"},
        ),
        (
            "blackout_delegation_grant.schema.json",
            {
                "delegate": "@node:test",
                "scopes": ["attestation:write"],
                "expires_at": 12345,
            },
            {"delegate": "", "scopes": [], "expires_at": 0},
        ),
        (
            "blackout_attestation.schema.json",
            {
                "node_id": "node-1",
                "subject_user_id": "@alice:test",
                "proof": "a" * 64,
            },
            {"node_id": "node-1", "subject_user_id": "@alice:test", "proof": "short"},
        ),
        (
            "blackout_peer_sync_metadata.schema.json",
            {
                "peer_id": "peer-a",
                "last_hash": "genesis",
                "pending_events": 0,
                "snapshot_version": 1,
            },
            {
                "peer_id": "",
                "last_hash": "genesis",
                "pending_events": -1,
                "snapshot_version": 0,
            },
        ),
        (
            "blackout_bootstrap_recovery_envelope.schema.json",
            {
                "metadata": {
                    "peer_id": "peer-a",
                    "last_hash": "genesis",
                    "pending_events": 0,
                    "snapshot_version": 1,
                },
                "events": [
                    {
                        "event_id": "evt-1",
                        "event_type": "MESSAGE_CREATED",
                        "timestamp": 1,
                        "actor_public_key": "k",
                        "encrypted_payload": "p",
                        "previous_hash": "genesis",
                        "room_id": "!room:test",
                        "crdt_site": "peer-a",
                        "crdt_counter": 1,
                        "signature": "s",
                    }
                ],
            },
            {"metadata": {"peer_id": "peer-a"}, "events": [{}]},
        ),
    ],
)
def test_wave1_schema_contracts(schema_name: str, valid_payload: dict, invalid_payload: dict) -> None:
    schema = _load_schema(schema_name)

    validate(instance=valid_payload, schema=schema)
    with pytest.raises(ValidationError):
        validate(instance=invalid_payload, schema=schema)
