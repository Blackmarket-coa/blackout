import pytest

from blackout_runtime.server_semantics import (
    ANNOUNCEMENT_POLICY_EVENT,
    ATTESTATION_EVENT,
    BLACKOUT_CHANNEL_TYPE_EVENT,
    BLACKOUT_PRESENCE_ROUTE,
    BOOST_STATE_EVENT,
    DELIBERATION_EXECUTION_EVENT,
    DELIBERATION_PROPOSAL_EVENT,
    DELIBERATION_VOTE_EVENT,
    DELEGATION_GRANT_EVENT,
    GOVERNANCE_ATTESTATION_EVENT,
    GOVERNANCE_PROPOSAL_EVENT,
    GOVERNANCE_VOTE_EVENT,
    PAID_ROOM_STATE_EVENT,
    REPUTATION_UPDATE_EVENT,
    STEGO_ENTITLEMENTS_EVENT,
    STEGO_POLICY_EVENT,
    TOWNHALL_AGENDA_EVENT,
    TOWNHALL_SESSION_EVENT,
    TOWNHALL_SUMMARY_EVENT,
    BlackoutPresenceService,
    BlackoutServerSemantics,
)


@pytest.mark.parametrize(
    "channel_type",
    [
        "voice",
        "forum",
        "governance",
        "dispute",
        "blackout_cell_space",
        "blackout_dead_drop_room",
        "blackout_announcement_room",
    ],
)
def test_on_create_room_enforces_template(channel_type: str) -> None:
    semantics = BlackoutServerSemantics()
    config = {"creation_content": {"m.blackout.channel.type": channel_type}}

    semantics.on_create_room(config)

    initial_state = config["initial_state"]
    types = {event["type"] for event in initial_state}
    assert "m.room.join_rules" in types
    assert "m.room.power_levels" in types
    assert BLACKOUT_CHANNEL_TYPE_EVENT in types


def test_on_create_room_rejects_unknown_channel_type() -> None:
    semantics = BlackoutServerSemantics()
    with pytest.raises(ValueError, match="Unsupported blackout channel type"):
        semantics.on_create_room(
            {"creation_content": {"m.blackout.channel.type": "unknown"}}
        )


def test_validate_custom_event_schemas_accepts_valid_payloads() -> None:
    semantics = BlackoutServerSemantics()

    assert semantics.check_event_allowed(
        GOVERNANCE_PROPOSAL_EVENT,
        {
            "proposal_id": "p1",
            "title": "Activate depot",
            "options": ["yes", "no"],
            "opens_at": 1,
            "closes_at": 2,
        },
    )
    assert semantics.check_event_allowed(
        GOVERNANCE_VOTE_EVENT,
        {"proposal_id": "p1", "vote": "yes"},
    )
    assert semantics.check_event_allowed(
        GOVERNANCE_ATTESTATION_EVENT,
        {
            "proposal_id": "p1",
            "decision": "accepted",
            "attested_by": "@mod:test",
            "attestation_ref": "sig:abc",
        },
    )
    assert semantics.check_event_allowed(
        REPUTATION_UPDATE_EVENT,
        {"node_id": "node-7", "delta": 2, "reason": "delivery_success"},
    )
    assert semantics.check_event_allowed(
        PAID_ROOM_STATE_EVENT,
        {"paid_room": True, "plan_tier": "gold"},
    )
    assert semantics.check_event_allowed(
        BOOST_STATE_EVENT,
        {"boost_id": "b1", "boost_tier": 2, "boost_expiry_ts": 1_900_000_000},
    )
    assert semantics.check_event_allowed(
        DELIBERATION_PROPOSAL_EVENT,
        {
            "workflow_id": "w1",
            "title": "Select rollout",
            "options": ["ship", "hold"],
            "opens_at": 1,
            "closes_at": 2,
        },
    )
    assert semantics.check_event_allowed(
        DELIBERATION_VOTE_EVENT,
        {"workflow_id": "w1", "vote": "ship"},
    )
    assert semantics.check_event_allowed(
        DELIBERATION_EXECUTION_EVENT,
        {"workflow_id": "w1", "decision": "ship", "executed_at": 3},
    )
    assert semantics.check_event_allowed(
        TOWNHALL_SESSION_EVENT,
        {
            "session_id": "s1",
            "title": "Sprint townhall",
            "starts_at": 10,
            "ends_at": 20,
            "state": "scheduled",
        },
    )
    assert semantics.check_event_allowed(
        TOWNHALL_AGENDA_EVENT,
        {"session_id": "s1", "item_id": "a1", "topic": "Roadmap", "order": 1},
    )
    assert semantics.check_event_allowed(
        TOWNHALL_SUMMARY_EVENT,
        {
            "session_id": "s1",
            "summary_id": "sum1",
            "highlights": ["Decision recorded"],
            "published_at": 30,
        },
    )
    assert semantics.check_event_allowed(
        STEGO_POLICY_EVENT, {"allow_stego": True, "max_ttl_hours": 48}
    )
    assert semantics.check_event_allowed(
        STEGO_ENTITLEMENTS_EVENT, {"@alice:test": ["stego:send"]}
    )
    assert semantics.check_event_allowed(
        DELEGATION_GRANT_EVENT,
        {
            "delegate": "@node:test",
            "scopes": ["attestation:write"],
            "expires_at": 1,
        },
    )
    assert semantics.check_event_allowed(
        ATTESTATION_EVENT,
        {"node_id": "node-7", "subject_user_id": "@alice:test", "proof": "a" * 64},
    )
    assert semantics.check_event_allowed(
        BLACKOUT_CHANNEL_TYPE_EVENT,
        {"channel_type": "governance"},
    )


@pytest.mark.parametrize(
    ("event_type", "content", "error"),
    [
        (
            GOVERNANCE_PROPOSAL_EVENT,
            {"proposal_id": "p1", "title": "bad", "options": ["yes"]},
            "missing required fields",
        ),
        (
            GOVERNANCE_VOTE_EVENT,
            {"proposal_id": "p1", "vote": ""},
            "non-empty string vote",
        ),
        (
            REPUTATION_UPDATE_EVENT,
            {"node_id": "n1", "delta": "x", "reason": "bad"},
            "delta must be numeric",
        ),
        (
            PAID_ROOM_STATE_EVENT,
            {"paid_room": "yes"},
            "boolean paid_room",
        ),
        (
            BOOST_STATE_EVENT,
            {"boost_id": "b", "boost_tier": 40, "boost_expiry_ts": 1},
            "boost_tier must be integer 0..10",
        ),
        (
            DELIBERATION_PROPOSAL_EVENT,
            {"workflow_id": "w", "title": "t", "options": ["only"], "opens_at": 1, "closes_at": 2},
            "at least two non-empty strings",
        ),
        (
            DELIBERATION_EXECUTION_EVENT,
            {"workflow_id": "w", "decision": "", "executed_at": 0},
            "non-empty decision",
        ),
        (
            TOWNHALL_SESSION_EVENT,
            {"session_id": "s", "title": "t", "starts_at": 1, "ends_at": 2, "state": "unknown"},
            "state must be scheduled|live|closed",
        ),
        (
            BLACKOUT_CHANNEL_TYPE_EVENT,
            {"channel_type": "invalid"},
            "supported channel_type",
        ),
        (
            STEGO_POLICY_EVENT,
            {"allow_stego": "yes"},
            "boolean allow_stego",
        ),
        (
            STEGO_ENTITLEMENTS_EVENT,
            {"@alice:test": "stego:send"},
            "scope lists",
        ),
        (
            DELEGATION_GRANT_EVENT,
            {"delegate": "@n:test", "scopes": [], "expires_at": 1},
            "non-empty scopes",
        ),
        (
            ATTESTATION_EVENT,
            {"node_id": "n1", "subject_user_id": "@a:test", "proof": "short"},
            "signature string",
        ),
    ],
)
def test_validate_custom_event_schemas_rejects_malformed_payloads(
    event_type: str, content: dict, error: str
) -> None:
    semantics = BlackoutServerSemantics()
    with pytest.raises(ValueError, match=error):
        semantics.check_event_allowed(event_type, content)


def test_channel_template_blocks_unapproved_event_types() -> None:
    semantics = BlackoutServerSemantics()

    with pytest.raises(ValueError, match="not allowed"):
        semantics.check_event_allowed(
            "m.room.server_acl", {"allow": []}, channel_type="voice"
        )


def test_extended_presence_endpoint_and_states() -> None:
    presence = BlackoutPresenceService()
    presence.set_presence("@alice:test", "delivering")

    assert BLACKOUT_PRESENCE_ROUTE == "/_synapse/client/blackout/presence"
    assert presence.get_presence("@alice:test") == "delivering"

    with pytest.raises(ValueError, match="Unsupported blackout presence state"):
        presence.set_presence("@alice:test", "online")


def test_on_create_room_preset_wiring_for_cell_and_dead_drop() -> None:
    semantics = BlackoutServerSemantics()

    cell_config = {"preset": "blackout_cell_space"}
    semantics.on_create_room(cell_config)
    cell_state = {
        event["type"]: event["content"] for event in cell_config["initial_state"]
    }
    assert (
        cell_config["creation_content"]["m.blackout.channel.type"]
        == "blackout_cell_space"
    )
    assert cell_state["m.room.join_rules"]["join_rule"] == "invite"
    assert cell_state["m.room.guest_access"]["guest_access"] == "forbidden"

    dead_drop_config = {"preset": "blackout_dead_drop_room"}
    semantics.on_create_room(dead_drop_config)
    dead_drop_state = {
        event["type"]: event["content"] for event in dead_drop_config["initial_state"]
    }
    assert (
        dead_drop_config["creation_content"]["m.blackout.channel.type"]
        == "blackout_dead_drop_room"
    )
    assert dead_drop_state["m.room.join_rules"]["join_rule"] == "invite"
    assert (
        dead_drop_state["m.room.history_visibility"]["history_visibility"] == "joined"
    )


def test_dead_drop_template_blocks_unapproved_event_types() -> None:
    semantics = BlackoutServerSemantics()

    with pytest.raises(ValueError, match="not allowed"):
        semantics.check_event_allowed(
            "m.room.topic",
            {"topic": "not allowed"},
            channel_type="blackout_dead_drop_room",
        )


@pytest.mark.parametrize("blocked_type", ["m.room.message", "m.room.encrypted"])
def test_governance_and_dispute_migration_block_legacy_message_payloads(
    blocked_type: str,
) -> None:
    semantics = BlackoutServerSemantics()

    with pytest.raises(ValueError, match="during migration; use m.blackout.signal"):
        semantics.check_event_allowed(
            blocked_type,
            {"body": "legacy"},
            channel_type="governance",
        )

    with pytest.raises(ValueError, match="during migration; use m.blackout.signal"):
        semantics.check_event_allowed(
            blocked_type,
            {"body": "legacy"},
            channel_type="dispute",
        )


def test_announcement_preset_history_visibility_and_event_allowlist() -> None:
    semantics = BlackoutServerSemantics()
    config = {"preset": "blackout_announcement_room"}
    semantics.on_create_room(config)

    by_type = {entry["type"]: entry["content"] for entry in config["initial_state"]}
    assert by_type["m.room.history_visibility"]["history_visibility"] == "joined"

    with pytest.raises(ValueError, match="not allowed"):
        semantics.check_event_allowed(
            "m.room.encrypted",
            {"ciphertext": "x"},
            channel_type="blackout_announcement_room",
        )


def test_cell_space_applies_federation_acl_template_by_trust_tier() -> None:
    semantics = BlackoutServerSemantics()

    config = {
        "preset": "blackout_cell_space",
        "creation_content": {"blackout.federation.trust_tier": "restricted"},
    }
    semantics.on_create_room(config)

    by_type = {entry["type"]: entry["content"] for entry in config["initial_state"]}
    assert by_type["m.room.server_acl"]["deny"] == ["*"]
    assert by_type["m.room.server_acl"]["allow"] == ["*.local"]


def test_cell_space_rejects_unknown_trust_tier() -> None:
    semantics = BlackoutServerSemantics()
    with pytest.raises(ValueError, match="Unsupported federation trust tier"):
        semantics.on_create_room(
            {
                "preset": "blackout_cell_space",
                "creation_content": {"blackout.federation.trust_tier": "internet"},
            }
        )


def test_validate_announcement_policy_event() -> None:
    semantics = BlackoutServerSemantics()
    assert semantics.check_event_allowed(
        ANNOUNCEMENT_POLICY_EVENT,
        {
            "sender_roles": ["announcer", "moderator"],
            "fanout_mode": "delayed_window",
            "delayed_fanout_min_ms": 5000,
            "delayed_fanout_max_ms": 15000,
            "rollback_procedure_ref": "docs/ops/announcement_fanout_rollback.md",
        },
    )

    with pytest.raises(ValueError, match="requires rollback_procedure_ref"):
        semantics.check_event_allowed(
            ANNOUNCEMENT_POLICY_EVENT,
            {
                "sender_roles": ["announcer"],
                "fanout_mode": "delayed_window",
                "delayed_fanout_min_ms": 5000,
                "delayed_fanout_max_ms": 15000,
            },
        )
