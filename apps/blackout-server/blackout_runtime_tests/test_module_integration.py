from __future__ import annotations

import asyncio
import hashlib
import hmac
import io
import os
import tempfile

import pytest

from blackout_runtime.module import (
    BLACKOUT_PRESENCE_ACCOUNT_DATA_TYPE,
    BlackoutRuntimeModule,
    PLUGIN_POLICY_EVENT_TYPE,
    PLUGIN_REGISTER_EVENT_TYPE,
    RUNTIME_EXTENSION_EVENT_TYPE,
)
from blackout_runtime.server_semantics import (
    ANNOUNCEMENT_POLICY_EVENT,
    ATTESTATION_EVENT,
    BLACKOUT_CHANNEL_TYPE_EVENT,
    BOOST_STATE_EVENT,
    DELIBERATION_EXECUTION_EVENT,
    DELIBERATION_PROPOSAL_EVENT,
    DELIBERATION_VOTE_EVENT,
    DELEGATION_GRANT_EVENT,
    GOVERNANCE_PROPOSAL_EVENT,
    GOVERNANCE_VOTE_EVENT,
    TOWNHALL_SESSION_EVENT,
    STEGO_POLICY_EVENT,
)
from synapse.api.errors import Codes, SynapseError


class _DummyUser:
    def __init__(self, user_id: str):
        self._user_id = user_id

    def to_string(self) -> str:
        return self._user_id


class _DummyRequester:
    def __init__(self, user_id: str):
        self.user = _DummyUser(user_id)


class _DummyEvent:
    def __init__(
        self,
        event_type: str,
        content: dict,
        room_id: str = "!r:test",
        sender: str = "@alice:test",
        event_id: str = "$event",
    ):
        self.type = event_type
        self.content = content
        self.room_id = room_id
        self.sender = sender
        self.event_id = event_id
        self.origin_server_ts = 1


class _DummyStateEvent:
    def __init__(self, content: dict):
        self.content = content


class _DummyRequest:
    def __init__(self, body: bytes = b"", args: dict[bytes, list[bytes]] | None = None):
        self.content = io.BytesIO(body)
        self.args = args or {}


class _FakeAccountDataManager:
    def __init__(self):
        self._store: dict[tuple[str, str], dict] = {}

    async def get_global(self, user_id: str, data_type: str):
        return self._store.get((user_id, data_type))

    async def put_global(self, user_id: str, data_type: str, new_data: dict):
        self._store[(user_id, data_type)] = dict(new_data)


class _FakeDbPool:
    async def runInteraction(self, desc, func):
        del desc

        class T:
            def execute(self, sql, args):
                self.rows = []

            def __iter__(self):
                return iter([])

        return func(T())


class _FakeStore:
    db_pool = _FakeDbPool()

    def get_room_max_token(self):
        return "unused"

    async def get_recent_events_for_room(self, room_id, limit, end_token):
        del room_id, limit, end_token
        return [], None

    async def get_events_as_list(self, event_ids):
        del event_ids
        return []


class _FakeModuleApi:
    def __init__(self):
        self.callbacks = {}
        self.resources = {}
        self.account_data_manager = _FakeAccountDataManager()
        self._requester = _DummyRequester("@alice:test")
        self._store = _FakeStore()

    def register_third_party_rules_callbacks(self, **kwargs):
        self.callbacks.update(kwargs)

    def register_web_resource(self, path, resource):
        self.resources[path] = resource

    async def get_user_by_req(self, request):
        del request
        return self._requester


def _build_module(api: _FakeModuleApi, **config: object) -> BlackoutRuntimeModule:
    fd, path = tempfile.mkstemp(suffix=".sqlite3")
    os.close(fd)
    base = {"persistence_path": path}
    base.update(config)
    return BlackoutRuntimeModule(base, api)


def test_module_registers_callbacks_and_blackout_resource_tree() -> None:
    api = _FakeModuleApi()
    module = _build_module(api)

    assert "on_create_room" in api.callbacks
    assert "check_event_allowed" in api.callbacks
    assert "on_new_event" in api.callbacks
    assert "/_synapse/client/blackout" in api.resources
    assert module is not None


def test_on_create_room_callback_applies_template_state() -> None:
    api = _FakeModuleApi()
    module = _build_module(api)

    config = {"creation_content": {"m.blackout.channel.type": "governance"}}
    asyncio.run(module.on_create_room(api._requester, config, False))

    initial_state = config["initial_state"]
    by_type = {entry["type"]: entry["content"] for entry in initial_state}
    assert by_type["m.room.join_rules"]["join_rule"] == "invite"
    assert by_type["m.room.power_levels"]["state_default"] == 100
    assert by_type[BLACKOUT_CHANNEL_TYPE_EVENT]["channel_type"] == "governance"


def test_on_create_room_callback_wires_dead_drop_preset() -> None:
    api = _FakeModuleApi()
    module = _build_module(api)

    config = {"preset": "blackout_dead_drop_room"}
    asyncio.run(module.on_create_room(api._requester, config, False))

    assert (
        config["creation_content"]["m.blackout.channel.type"]
        == "blackout_dead_drop_room"
    )
    initial_state = {
        entry["type"]: entry["content"] for entry in config["initial_state"]
    }
    assert initial_state["m.room.join_rules"]["join_rule"] == "invite"
    assert initial_state["m.room.history_visibility"]["history_visibility"] == "joined"


def test_check_event_allowed_rejects_bad_governance_payload_and_duplicate_vote() -> (
    None
):
    api = _FakeModuleApi()
    module = _build_module(api)

    with pytest.raises(SynapseError, match="missing required fields"):
        asyncio.run(
            module.check_event_allowed(
                _DummyEvent(GOVERNANCE_PROPOSAL_EVENT, {"proposal_id": "p1"}),
                {
                    (BLACKOUT_CHANNEL_TYPE_EVENT, ""): _DummyStateEvent(
                        {"channel_type": "governance"}
                    )
                },
            )
        )

    asyncio.run(
        module.on_new_event(
            _DummyEvent(
                "m.blackout.governance.vote",
                {"proposal_id": "p1", "vote": "yes", "decision": "accepted"},
                room_id="!gov:test",
                sender="@alice:test",
                event_id="$vote1",
            ),
            {},
        )
    )

    with pytest.raises(SynapseError, match="Only one vote"):
        asyncio.run(
            module.check_event_allowed(
                _DummyEvent(
                    "m.blackout.governance.vote",
                    {"proposal_id": "p1", "vote": "no"},
                    room_id="!gov:test",
                    sender="@alice:test",
                    event_id="$vote2",
                ),
                {
                    (BLACKOUT_CHANNEL_TYPE_EVENT, ""): _DummyStateEvent(
                        {"channel_type": "governance"}
                    )
                },
            )
        )


def test_presence_and_blackout_synapse_api_resources() -> None:
    api = _FakeModuleApi()
    module = _build_module(api)
    root = api.resources["/_synapse/client/blackout"]

    presence = root.children[b"presence"]
    code, body = asyncio.run(
        presence._async_render_PUT(_DummyRequest(b'{"state":"delivering"}'))
    )
    assert code == 200
    assert body["state"] == "delivering"

    stored = asyncio.run(
        api.account_data_manager.get_global(
            "@alice:test", BLACKOUT_PRESENCE_ACCOUNT_DATA_TYPE
        )
    )
    assert stored == {"state": "delivering"}

    asyncio.run(
        module.on_new_event(
            _DummyEvent(
                "m.blackout.governance.vote",
                {"proposal_id": "p1", "vote": "yes", "decision": "accepted"},
                room_id="!gov:test",
                sender="@alice:test",
                event_id="$v1",
            ),
            {},
        )
    )

    decisions_resource = root.children[b"governance"].children[b"decisions"]
    code, body = asyncio.run(
        decisions_resource._async_render_GET(
            _DummyRequest(args={b"room_id": [b"!gov:test"], b"since": [b"0"]})
        )
    )
    assert code == 200
    assert body["decisions"][0]["decision"] == "accepted"

    reputation_root = root.children[b"reputation"]
    node_resource = reputation_root.getChild(b"node-1", _DummyRequest())
    code, body = asyncio.run(node_resource._async_render_GET(_DummyRequest()))
    assert code == 200
    assert body["node_id"] == "node-1"


def test_dead_drop_retention_purge_schedules_and_purges_by_ttl() -> None:
    api = _FakeModuleApi()
    module = _build_module(api)

    state_events = {
        (BLACKOUT_CHANNEL_TYPE_EVENT, ""): _DummyStateEvent(
            {"channel_type": "blackout_dead_drop_room"}
        )
    }

    asyncio.run(
        module.on_new_event(
            _DummyEvent(
                "m.room.message",
                {"body": "expired"},
                room_id="!dd:test",
                sender="@alice:test",
                event_id="$dd1",
            ),
            state_events,
        )
    )
    asyncio.run(
        module.on_new_event(
            _DummyEvent(
                "m.room.message",
                {"body": "fresh"},
                room_id="!dd:test",
                sender="@alice:test",
                event_id="$dd2",
            ),
            state_events,
        )
    )

    module._conn.execute(
        "UPDATE blackout_dead_drop_retention SET expires_at_ms = ? WHERE event_id = ?",
        (1_000, "$dd1"),
    )
    module._conn.execute(
        "UPDATE blackout_dead_drop_retention SET expires_at_ms = ? WHERE event_id = ?",
        (9_999_999, "$dd2"),
    )
    module._conn.commit()

    purged = module.run_dead_drop_purge(now_ms=2_000)
    assert [item["event_id"] for item in purged] == ["$dd1"]
    assert purged[0]["tombstone_event_type"] == "m.room.tombstone"

    dd1 = module.get_dead_drop_retention_record("$dd1")
    dd2 = module.get_dead_drop_retention_record("$dd2")
    assert dd1 is not None and dd1["purged_at_ms"] == 2_000
    assert dd2 is not None and dd2["purged_at_ms"] is None


def test_stego_signal_requires_entitlement_and_obeys_policy_ttl() -> None:
    api = _FakeModuleApi()
    module = _build_module(api)

    state_events = {
        (BLACKOUT_CHANNEL_TYPE_EVENT, ""): _DummyStateEvent({"channel_type": "governance"}),
        (STEGO_POLICY_EVENT, ""): _DummyStateEvent({"allow_stego": True, "max_ttl_hours": 24}),
        ("m.blackout.entitlements", ""): _DummyStateEvent({"@alice:test": ["stego:send"]}),
    }
    event = _DummyEvent(
        "m.blackout.signal",
        {
            "blackout_stego": {
                "carrier": "image",
                "payload_hash": "abcdef1234567890",
                "policy_id": "policy-a",
                "ttl_hours": 12,
            }
        },
        event_id="$stego1",
    )
    asyncio.run(module.check_event_allowed(event, state_events))
    asyncio.run(module.on_new_event(event, state_events))
    assert module.get_stego_retention_record("$stego1") is not None

    blocked_state_events = {
        (STEGO_POLICY_EVENT, ""): _DummyStateEvent({"allow_stego": False, "max_ttl_hours": 24}),
        ("m.blackout.entitlements", ""): _DummyStateEvent({"@alice:test": ["stego:send"]}),
    }
    with pytest.raises(SynapseError, match="disabled by room policy"):
        asyncio.run(module.check_event_allowed(event, blocked_state_events))

    no_entitlement = {(STEGO_POLICY_EVENT, ""): _DummyStateEvent({"allow_stego": True})}
    with pytest.raises(SynapseError, match="entitlement required"):
        asyncio.run(module.check_event_allowed(event, no_entitlement))


def test_stego_retention_purge_marks_only_expired_records() -> None:
    api = _FakeModuleApi()
    module = _build_module(api)

    state_events = {
        (BLACKOUT_CHANNEL_TYPE_EVENT, ""): _DummyStateEvent({"channel_type": "governance"}),
        (STEGO_POLICY_EVENT, ""): _DummyStateEvent({"allow_stego": True, "max_ttl_hours": 72}),
        ("m.blackout.entitlements", ""): _DummyStateEvent({"@alice:test": ["stego:send"]}),
    }
    expired = _DummyEvent(
        "m.blackout.signal",
        {"blackout_stego": {"carrier": "image", "payload_hash": "expired-hash-012345", "policy_id": "p1"}},
        event_id="$stego-expired",
    )
    fresh = _DummyEvent(
        "m.blackout.signal",
        {"blackout_stego": {"carrier": "audio", "payload_hash": "fresh-hash-01234567", "policy_id": "p1"}},
        event_id="$stego-fresh",
    )
    asyncio.run(module.on_new_event(expired, state_events))
    asyncio.run(module.on_new_event(fresh, state_events))

    module._conn.execute(
        "UPDATE blackout_stego_retention SET expires_at_ms = ? WHERE event_id = ?",
        (1_000, "$stego-expired"),
    )
    module._conn.execute(
        "UPDATE blackout_stego_retention SET expires_at_ms = ? WHERE event_id = ?",
        (9_999_999, "$stego-fresh"),
    )
    module._conn.commit()

    purged = module.run_stego_purge(now_ms=2_000)
    assert [row["event_id"] for row in purged] == ["$stego-expired"]
    assert purged[0]["tombstone_event_type"] == "m.blackout.stego.purge"

    expired_row = module.get_stego_retention_record("$stego-expired")
    fresh_row = module.get_stego_retention_record("$stego-fresh")
    assert expired_row is not None and expired_row["purged_at_ms"] == 2_000
    assert fresh_row is not None and fresh_row["purged_at_ms"] is None


def test_signal_ttl_and_purge_irretrievability_controls() -> None:
    api = _FakeModuleApi()
    module = _build_module(
        api,
        blackout_signal_ttl_hours=24,
        signal_purge_batch_size=10,
        blackout_purge_interval_minutes=5,
    )
    state_events = {
        (BLACKOUT_CHANNEL_TYPE_EVENT, ""): _DummyStateEvent({"channel_type": "governance"}),
        ("m.blackout.entitlements", ""): _DummyStateEvent({"@alice:test": ["stego:send"]}),
    }
    event = _DummyEvent(
        "m.blackout.signal",
        {
            "schema_version": 2,
            "message_metadata": {
                "message_id": "m1",
                "sender_key_id": "k1",
                "content_class": "control",
            },
            "blackout_stego": {
                "carrier": "image",
                "payload_hash": "abcdef1234567890",
                "policy_id": "policy-a",
            },
        },
        event_id="$signal-retain-1",
    )
    asyncio.run(module.on_new_event(event, state_events))
    assert module.get_signal_retention_record("$signal-retain-1") is not None
    assert module.is_signal_event_retrievable("$signal-retain-1")

    module._conn.execute(
        "UPDATE blackout_signal_retention SET expires_at_ms = ? WHERE event_id = ?",
        (1_000, "$signal-retain-1"),
    )
    module._conn.commit()
    purged = module.run_signal_purge(now_ms=2_000)
    assert [row["event_id"] for row in purged] == ["$signal-retain-1"]
    assert not module.is_signal_event_retrievable("$signal-retain-1")


def test_webrtc_relay_abuse_controls_and_metrics() -> None:
    api = _FakeModuleApi()
    module = _build_module(api, relay_fallback_limit_per_minute=1)
    state_events = {
        (BLACKOUT_CHANNEL_TYPE_EVENT, ""): _DummyStateEvent({"channel_type": "governance"}),
        ("m.blackout.entitlements", ""): _DummyStateEvent({"@alice:test": ["stego:send"]}),
    }

    first = _DummyEvent(
        "m.blackout.signal",
        {
            "schema_version": 2,
            "message_metadata": {
                "message_id": "w1",
                "sender_key_id": "k1",
                "content_class": "webrtc-session",
            },
            "turn_usage": {"relay_fallback": True},
            "blackout_stego": {
                "carrier": "image",
                "payload_hash": "abcdef1234567890",
                "policy_id": "policy-a",
            },
        },
        event_id="$webrtc1",
    )
    asyncio.run(module.check_event_allowed(first, state_events))

    second = _DummyEvent(
        "m.blackout.signal",
        {
            "schema_version": 2,
            "message_metadata": {
                "message_id": "w2",
                "sender_key_id": "k1",
                "content_class": "webrtc-session",
            },
            "turn_usage": {"relay_fallback": True},
            "blackout_stego": {
                "carrier": "audio",
                "payload_hash": "abcdef1234567891",
                "policy_id": "policy-a",
            },
        },
        event_id="$webrtc2",
    )
    with pytest.raises(SynapseError, match="Relay fallback rate limit exceeded"):
        asyncio.run(module.check_event_allowed(second, state_events))

    metrics = module.snapshot_signal_metrics()
    assert metrics["content_class.webrtc-session.accepted"] >= 1
    assert metrics["relay_fallback_total"] >= 1


def test_migration_blocks_legacy_payloads_with_forbidden_errcode_and_telemetry() -> None:
    api = _FakeModuleApi()
    module = _build_module(api)
    state_events = {
        (BLACKOUT_CHANNEL_TYPE_EVENT, ""): _DummyStateEvent({"channel_type": "governance"}),
    }

    blocked = _DummyEvent(
        "m.room.message",
        {"body": "legacy message"},
        event_id="$legacy-msg",
    )
    with pytest.raises(SynapseError, match="use m.blackout.signal") as exc:
        asyncio.run(module.check_event_allowed(blocked, state_events))
    assert exc.value.errcode == Codes.FORBIDDEN

    blocked_encrypted = _DummyEvent(
        "m.room.encrypted",
        {"ciphertext": "legacy encrypted"},
        event_id="$legacy-enc",
    )
    with pytest.raises(SynapseError, match="use m.blackout.signal"):
        asyncio.run(module.check_event_allowed(blocked_encrypted, state_events))

    metrics = module.snapshot_signal_metrics()
    assert metrics["migration_blocked.m.room.message"] == 1
    assert metrics["migration_blocked.m.room.encrypted"] == 1

    anomalies = module.drain_anomaly_events()
    assert len(anomalies) == 2
    assert anomalies[0]["type"] == "migration_payload_blocked"


def test_deliberation_vote_window_duplicate_and_execution_guards() -> None:
    api = _FakeModuleApi()
    module = _build_module(api)
    state = {(BLACKOUT_CHANNEL_TYPE_EVENT, ""): _DummyStateEvent({"channel_type": "governance"})}
    room_id = "!delib:test"

    proposal = _DummyEvent(
        DELIBERATION_PROPOSAL_EVENT,
        {
            "workflow_id": "w42",
            "title": "Enable feature",
            "options": ["yes", "no"],
            "opens_at": 0,
            "closes_at": 4_000_000_000,
        },
        room_id=room_id,
        event_id="$delib-proposal",
    )
    asyncio.run(module.check_event_allowed(proposal, state))

    vote = _DummyEvent(
        DELIBERATION_VOTE_EVENT,
        {"workflow_id": "w42", "vote": "yes"},
        room_id=room_id,
        event_id="$delib-v1",
    )
    asyncio.run(module.check_event_allowed(vote, state))

    with pytest.raises(SynapseError, match="only one vote per user per workflow"):
        asyncio.run(module.check_event_allowed(vote, state))

    exec_event = _DummyEvent(
        DELIBERATION_EXECUTION_EVENT,
        {"workflow_id": "w42", "decision": "accepted", "executed_at": 100},
        room_id=room_id,
        event_id="$delib-exec",
    )
    asyncio.run(module.check_event_allowed(exec_event, state))

    bad_exec = _DummyEvent(
        DELIBERATION_EXECUTION_EVENT,
        {"workflow_id": "missing", "decision": "accepted", "executed_at": 100},
        room_id=room_id,
        event_id="$delib-exec-missing",
    )
    with pytest.raises(SynapseError, match="unknown workflow_id"):
        asyncio.run(module.check_event_allowed(bad_exec, state))


def test_boost_rate_limit_and_townhall_metrics() -> None:
    api = _FakeModuleApi()
    module = _build_module(api, boost_update_limit_per_minute=1)
    state = {(BLACKOUT_CHANNEL_TYPE_EVENT, ""): _DummyStateEvent({"channel_type": "governance"})}

    first = _DummyEvent(
        BOOST_STATE_EVENT,
        {"boost_id": "b1", "boost_tier": 1, "boost_expiry_ts": 1_900_000_000},
        event_id="$boost1",
    )
    asyncio.run(module.check_event_allowed(first, state))

    second = _DummyEvent(
        BOOST_STATE_EVENT,
        {"boost_id": "b2", "boost_tier": 2, "boost_expiry_ts": 1_900_000_001},
        event_id="$boost2",
    )
    with pytest.raises(SynapseError, match="Boost update rate limit exceeded"):
        asyncio.run(module.check_event_allowed(second, state))

    townhall = _DummyEvent(
        TOWNHALL_SESSION_EVENT,
        {
            "session_id": "s1",
            "title": "Townhall",
            "starts_at": 10,
            "ends_at": 20,
            "state": "scheduled",
        },
        event_id="$townhall1",
    )
    asyncio.run(module.check_event_allowed(townhall, state))
    metrics = module.snapshot_signal_metrics()
    assert metrics[f"townhall.{TOWNHALL_SESSION_EVENT}.accepted"] >= 1


def test_governance_vote_requires_known_open_proposal_window() -> None:
    api = _FakeModuleApi()
    module = _build_module(api)

    room_id = "!gov:test"
    state = {(BLACKOUT_CHANNEL_TYPE_EVENT, ""): _DummyStateEvent({"channel_type": "governance"})}
    asyncio.run(
        module.on_new_event(
            _DummyEvent(
                GOVERNANCE_PROPOSAL_EVENT,
                {
                    "proposal_id": "p42",
                    "title": "Ship",
                    "options": ["yes", "no"],
                    "opens_at": 0,
                    "closes_at": 4_000_000_000,
                },
                room_id=room_id,
                event_id="$proposal",
            ),
            state,
        )
    )

    asyncio.run(
        module.check_event_allowed(
            _DummyEvent(
                GOVERNANCE_VOTE_EVENT,
                {"proposal_id": "p42", "vote": "yes"},
                room_id=room_id,
                event_id="$vote-ok",
            ),
            state,
        )
    )

    with pytest.raises(SynapseError, match="unknown governance proposal_id"):
        asyncio.run(
            module.check_event_allowed(
                _DummyEvent(
                    GOVERNANCE_VOTE_EVENT,
                    {"proposal_id": "missing", "vote": "yes"},
                    room_id=room_id,
                    event_id="$vote-missing",
                ),
                state,
            )
        )


def test_attestation_requires_delegated_scope_and_valid_proof() -> None:
    api = _FakeModuleApi()
    module = _build_module(api)
    module._attestation_secret = "test-secret"

    good_proof = hashlib.sha256("node-1:@alice:test:test-secret".encode("utf-8")).hexdigest()
    event = _DummyEvent(
        ATTESTATION_EVENT,
        {"node_id": "node-1", "subject_user_id": "@alice:test", "proof": good_proof},
        sender="@delegate:test",
    )
    state = {
        (DELEGATION_GRANT_EVENT, "@delegate:test"): _DummyStateEvent(
            {"delegate": "@delegate:test", "scopes": ["attestation:write"], "expires_at": 9_999_999}
        )
    }
    asyncio.run(module.check_event_allowed(event, state))

    with pytest.raises(SynapseError, match="verification failed"):
        asyncio.run(
            module.check_event_allowed(
                _DummyEvent(
                    ATTESTATION_EVENT,
                    {
                        "node_id": "node-1",
                        "subject_user_id": "@alice:test",
                        "proof": "badbadbadbadbadbadbadbadbadbadba",
                    },
                    sender="@delegate:test",
                ),
                state,
            )
        )

    with pytest.raises(SynapseError, match="Delegation scope required"):
        asyncio.run(module.check_event_allowed(event, {}))


def test_announcement_room_sender_restrictions_enforced() -> None:
    api = _FakeModuleApi()
    module = _build_module(api)

    restricted_state = {
        (BLACKOUT_CHANNEL_TYPE_EVENT, ""): _DummyStateEvent(
            {"channel_type": "blackout_announcement_room"}
        ),
        ("m.room.power_levels", ""): _DummyStateEvent(
            {
                "events": {"m.room.message": 50},
                "users": {"@announcer:test": 100, "@member:test": 0},
            }
        ),
    }

    with pytest.raises(SynapseError, match="not permitted"):
        asyncio.run(
            module.check_event_allowed(
                _DummyEvent(
                    "m.room.message",
                    {"body": "unauthorized", "blackout_sender_role": "member"},
                    room_id="!announce:test",
                    sender="@member:test",
                    event_id="$msg1",
                ),
                restricted_state,
            )
        )

    allowed, replacement_dict = asyncio.run(
        module.check_event_allowed(
            _DummyEvent(
                "m.room.message",
                {"body": "authorized", "blackout_sender_role": "announcer"},
                room_id="!announce:test",
                sender="@announcer:test",
                event_id="$msg2",
            ),
            restricted_state,
        )
    )
    assert allowed is True
    assert replacement_dict is None


def test_plugin_registration_enforces_allowlist_signature_revocation_and_capabilities() -> None:
    api = _FakeModuleApi()
    module = _build_module(api, plugin_signature_secret="plugin-secret")
    capabilities = ["stego:encode"]
    good_signature = hmac.new(
        b"plugin-secret",
        b"plugin-alpha:1.0.0:key-1:stego:encode",
        hashlib.sha256,
    ).hexdigest()
    state_events = {
        (PLUGIN_POLICY_EVENT_TYPE, ""): _DummyStateEvent(
            {
                "allowlisted_plugins": ["plugin-alpha"],
                "revoked_signing_key_ids": ["revoked-key"],
                "trusted_capabilities": ["stego:encode", "stego:decode"],
            }
        ),
    }
    allowed = _DummyEvent(
        PLUGIN_REGISTER_EVENT_TYPE,
        {
            "plugin_id": "plugin-alpha",
            "plugin_version": "1.0.0",
            "capabilities": capabilities,
            "signing_key_id": "key-1",
            "signature": good_signature,
        },
        event_id="$plugin-ok",
    )
    asyncio.run(module.check_event_allowed(allowed, state_events))

    revoked = _DummyEvent(
        PLUGIN_REGISTER_EVENT_TYPE,
        {
            "plugin_id": "plugin-alpha",
            "plugin_version": "1.0.0",
            "capabilities": capabilities,
            "signing_key_id": "revoked-key",
            "signature": good_signature,
        },
        event_id="$plugin-revoked",
    )
    with pytest.raises(SynapseError, match="signing key has been revoked"):
        asyncio.run(module.check_event_allowed(revoked, state_events))

    not_allowlisted = _DummyEvent(
        PLUGIN_REGISTER_EVENT_TYPE,
        {
            "plugin_id": "plugin-beta",
            "plugin_version": "1.0.0",
            "capabilities": capabilities,
            "signing_key_id": "key-1",
            "signature": good_signature,
        },
        event_id="$plugin-not-allowlisted",
    )
    with pytest.raises(SynapseError, match="not allowlisted"):
        asyncio.run(module.check_event_allowed(not_allowlisted, state_events))

    untrusted_capability = _DummyEvent(
        PLUGIN_REGISTER_EVENT_TYPE,
        {
            "plugin_id": "plugin-alpha",
            "plugin_version": "1.0.0",
            "capabilities": ["stego:encode", "dangerous:admin"],
            "signing_key_id": "key-1",
            "signature": good_signature,
        },
        event_id="$plugin-untrusted-capability",
    )
    with pytest.raises(SynapseError, match="outside trust policy"):
        asyncio.run(module.check_event_allowed(untrusted_capability, state_events))

    bad_signature = _DummyEvent(
        PLUGIN_REGISTER_EVENT_TYPE,
        {
            "plugin_id": "plugin-alpha",
            "plugin_version": "1.0.0",
            "capabilities": capabilities,
            "signing_key_id": "key-1",
            "signature": "deadbeef",
        },
        event_id="$plugin-bad-signature",
    )
    with pytest.raises(SynapseError, match="signature verification failed"):
        asyncio.run(module.check_event_allowed(bad_signature, state_events))

    reordered_signature = _DummyEvent(
        PLUGIN_REGISTER_EVENT_TYPE,
        {
            "plugin_id": "plugin-alpha",
            "plugin_version": "1.0.0",
            "capabilities": ["stego:decode", "stego:encode"],
            "signing_key_id": "key-1",
            "signature": hmac.new(
                b"plugin-secret",
                b"plugin-alpha:1.0.0:key-1:stego:decode,stego:encode",
                hashlib.sha256,
            ).hexdigest(),
        },
        event_id="$plugin-sorted-signature",
    )
    ordered_policy_state = {
        (PLUGIN_POLICY_EVENT_TYPE, ""): _DummyStateEvent(
            {
                "allowlisted_plugins": ["plugin-alpha"],
                "trusted_capabilities": ["stego:encode", "stego:decode"],
            }
        ),
    }
    asyncio.run(module.check_event_allowed(reordered_signature, ordered_policy_state))

    malformed_policy = {
        (PLUGIN_POLICY_EVENT_TYPE, ""): _DummyStateEvent(
            {
                "allowlisted_plugins": ["plugin-alpha", 5],
            }
        ),
    }
    with pytest.raises(SynapseError, match="not allowlisted"):
        asyncio.run(module.check_event_allowed(allowed, malformed_policy))


def test_runtime_extension_activation_requires_gate_contract_and_capability_negotiation() -> None:
    api = _FakeModuleApi()
    module = _build_module(
        api,
        blackout_enable_runtime_extensions=True,
        supported_extension_contract_versions=[2],
        supported_runtime_capabilities=["stego:processor", "governance:hooks"],
    )

    allowed = _DummyEvent(
        RUNTIME_EXTENSION_EVENT_TYPE,
        {
            "extension_id": "ext-safe",
            "contract_version": 2,
            "requested_capabilities": ["stego:processor"],
        },
        event_id="$ext-ok",
    )
    asyncio.run(module.check_event_allowed(allowed, {}))

    incompatible_contract = _DummyEvent(
        RUNTIME_EXTENSION_EVENT_TYPE,
        {
            "extension_id": "ext-legacy",
            "contract_version": 1,
            "requested_capabilities": ["stego:processor"],
        },
        event_id="$ext-contract-bad",
    )
    with pytest.raises(SynapseError, match="contract_version is incompatible"):
        asyncio.run(module.check_event_allowed(incompatible_contract, {}))

    unsupported_capability = _DummyEvent(
        RUNTIME_EXTENSION_EVENT_TYPE,
        {
            "extension_id": "ext-unsafe",
            "contract_version": 2,
            "requested_capabilities": ["admin:root"],
        },
        event_id="$ext-capability-bad",
    )
    with pytest.raises(SynapseError, match="unsupported capabilities"):
        asyncio.run(module.check_event_allowed(unsupported_capability, {}))

    bool_contract = _DummyEvent(
        RUNTIME_EXTENSION_EVENT_TYPE,
        {
            "extension_id": "ext-bool",
            "contract_version": True,
            "requested_capabilities": ["stego:processor"],
        },
        event_id="$ext-contract-bool",
    )
    with pytest.raises(SynapseError, match="requires integer contract_version"):
        asyncio.run(module.check_event_allowed(bool_contract, {}))

    empty_capabilities = _DummyEvent(
        RUNTIME_EXTENSION_EVENT_TYPE,
        {
            "extension_id": "ext-empty",
            "contract_version": 2,
            "requested_capabilities": [],
        },
        event_id="$ext-capability-empty",
    )
    with pytest.raises(SynapseError, match="requested_capabilities must be a list"):
        asyncio.run(module.check_event_allowed(empty_capabilities, {}))

    disabled_api = _FakeModuleApi()
    disabled_module = _build_module(
        disabled_api,
        blackout_enable_runtime_extensions=False,
    )
    with pytest.raises(SynapseError, match="disabled by configuration"):
        asyncio.run(
            disabled_module.check_event_allowed(
                _DummyEvent(
                    RUNTIME_EXTENSION_EVENT_TYPE,
                    {
                        "extension_id": "ext-disabled",
                        "contract_version": 1,
                        "requested_capabilities": ["stego:processor"],
                    },
                    event_id="$ext-disabled",
                ),
                {},
            )
        )


def test_announcement_fanout_role_and_delay_policy_gating() -> None:
    api = _FakeModuleApi()
    module = _build_module(api)

    state_events = {
        (BLACKOUT_CHANNEL_TYPE_EVENT, ""): _DummyStateEvent(
            {"channel_type": "blackout_announcement_room"}
        ),
        (ANNOUNCEMENT_POLICY_EVENT, ""): _DummyStateEvent(
            {
                "sender_roles": ["announcer"],
                "fanout_mode": "delayed_window",
                "delayed_fanout_min_ms": 5000,
                "delayed_fanout_max_ms": 10000,
                "rollback_procedure_ref": "docs/ops/announcement_fanout_rollback.md",
            }
        ),
        ("m.room.power_levels", ""): _DummyStateEvent(
            {"events": {"m.room.message": 50}, "users": {"@announcer:test": 100}}
        ),
    }

    with pytest.raises(SynapseError, match="Sender role"):
        asyncio.run(
            module.check_event_allowed(
                _DummyEvent(
                    "m.room.message",
                    {
                        "body": "x",
                        "blackout_sender_role": "member",
                        "blackout_fanout": {"delay_ms": 6000},
                    },
                    room_id="!announce:test",
                    sender="@announcer:test",
                    event_id="$f1",
                ),
                state_events,
            )
        )

    with pytest.raises(SynapseError, match="outside policy bounds"):
        asyncio.run(
            module.check_event_allowed(
                _DummyEvent(
                    "m.room.message",
                    {
                        "body": "x",
                        "blackout_sender_role": "announcer",
                        "blackout_fanout": {"delay_ms": 20000},
                    },
                    room_id="!announce:test",
                    sender="@announcer:test",
                    event_id="$f2",
                ),
                state_events,
            )
        )

    allowed, replacement_dict = asyncio.run(
        module.check_event_allowed(
            _DummyEvent(
                "m.room.message",
                {
                    "body": "x",
                    "blackout_sender_role": "announcer",
                    "blackout_fanout": {"delay_ms": 7000},
                },
                room_id="!announce:test",
                sender="@announcer:test",
                event_id="$f3",
            ),
            state_events,
        )
    )
    assert allowed is True
    assert replacement_dict is None


def test_federation_acl_template_compatibility_fixture() -> None:
    api = _FakeModuleApi()
    module = _build_module(api)

    config = {
        "preset": "blackout_cell_space",
        "creation_content": {"blackout.federation.trust_tier": "partner"},
    }
    asyncio.run(module.on_create_room(api._requester, config, False))

    by_type = {entry["type"]: entry["content"] for entry in config["initial_state"]}
    acl = by_type["m.room.server_acl"]
    assert "partner.example" in acl["allow"]
    assert acl["deny"] == []
    assert acl["allow_ip_literals"] is False


def test_dead_drop_invite_join_quota_guardrails_and_anomaly_hook() -> None:
    api = _FakeModuleApi()
    module = _build_module(api)

    module._dead_drop_invite_rate_limit_per_minute = 1
    module._dead_drop_join_rate_limit_per_minute = 1

    state_events = {
        (BLACKOUT_CHANNEL_TYPE_EVENT, ""): _DummyStateEvent(
            {"channel_type": "blackout_dead_drop_room"}
        )
    }

    allowed, _ = asyncio.run(
        module.check_event_allowed(
            _DummyEvent(
                "m.room.member",
                {"membership": "invite"},
                room_id="!dd:test",
                sender="@alice:test",
                event_id="$i1",
            ),
            state_events,
        )
    )
    assert allowed is True

    with pytest.raises(SynapseError, match="invite rate limit"):
        asyncio.run(
            module.check_event_allowed(
                _DummyEvent(
                    "m.room.member",
                    {"membership": "invite"},
                    room_id="!dd:test",
                    sender="@alice:test",
                    event_id="$i2",
                ),
                state_events,
            )
        )

    anomalies = module.drain_anomaly_events()
    assert anomalies and anomalies[0]["type"] == "dead_drop_membership_rate_exceeded"

    allowed, _ = asyncio.run(
        module.check_event_allowed(
            _DummyEvent(
                "m.room.member",
                {"membership": "join"},
                room_id="!dd:test",
                sender="@bob:test",
                event_id="$j1",
            ),
            state_events,
        )
    )
    assert allowed is True

    with pytest.raises(SynapseError, match="join rate limit"):
        asyncio.run(
            module.check_event_allowed(
                _DummyEvent(
                    "m.room.member",
                    {"membership": "join"},
                    room_id="!dd:test",
                    sender="@bob:test",
                    event_id="$j2",
                ),
                state_events,
            )
        )
