import base64
import json

import pytest
from nacl.signing import SigningKey

from blackout_runtime.envelope import EventEnvelope
from blackout_runtime.runtime import BlackoutNodeRuntime


def _event(
    signing_key: SigningKey, previous_hash: str, key: str, value: str, counter: int
) -> EventEnvelope:
    payload = base64.b64encode(
        json.dumps({"key": key, "value": value}).encode("utf-8")
    ).decode("ascii")
    return EventEnvelope.create(
        signing_key=signing_key,
        event_type="MESSAGE_CREATED",
        encrypted_payload=payload,
        previous_hash=previous_hash,
        room_id="!room:test",
        crdt_site="peer-a",
        crdt_counter=counter,
    )


def test_boot_from_snapshot_and_replay() -> None:
    key = SigningKey.generate()
    first = _event(key, "genesis", "topic", "hello", 1)
    second = _event(key, first.digest(), "topic", "world", 2)

    runtime = BlackoutNodeRuntime()
    runtime.boot_from_snapshot_and_replay(snapshot={}, replay_events=[first, second])

    assert runtime.crdt.values()["topic"] == "world"
    assert runtime.last_hash() == second.digest()


def test_recover_offline_rejoin_applies_missing_range() -> None:
    key = SigningKey.generate()
    first = _event(key, "genesis", "a", "1", 1)
    second = _event(key, first.digest(), "b", "2", 2)

    runtime = BlackoutNodeRuntime()
    runtime.boot_from_snapshot_and_replay(snapshot={}, replay_events=[first])

    applied = runtime.recover_offline_rejoin(
        last_known_hash=first.digest(),
        peer_events=[second],
    )

    assert applied == 1
    assert runtime.crdt.values()["b"] == "2"


def test_peer_sync_metadata_round_trip_validation() -> None:
    key = SigningKey.generate()
    first = _event(key, "genesis", "topic", "hello", 1)

    runtime = BlackoutNodeRuntime()
    runtime.boot_from_snapshot_and_replay(snapshot={}, replay_events=[first])
    metadata = runtime.build_peer_sync_metadata(peer_id="peer-a", snapshot_version=2)

    parsed = runtime.parse_peer_sync_metadata(metadata)
    assert parsed.peer_id == "peer-a"
    assert parsed.last_hash == first.digest()
    assert parsed.snapshot_version == 2


def test_bootstrap_recovery_envelope_replays_events() -> None:
    key = SigningKey.generate()
    first = _event(key, "genesis", "a", "1", 1)
    second = _event(key, first.digest(), "b", "2", 2)

    sender_runtime = BlackoutNodeRuntime()
    sender_runtime.boot_from_snapshot_and_replay(snapshot={}, replay_events=[first, second])

    envelope = sender_runtime.build_bootstrap_recovery_envelope(
        peer_id="peer-bootstrap",
        snapshot_version=1,
    )
    envelope["metadata"]["last_hash"] = "genesis"

    receiver_runtime = BlackoutNodeRuntime()
    applied = receiver_runtime.recover_from_bootstrap_recovery_envelope(envelope=envelope)
    assert applied == 2
    assert receiver_runtime.crdt.values()["b"] == "2"


def test_peer_sync_metadata_rejects_invalid_shape() -> None:
    runtime = BlackoutNodeRuntime()

    bad = {
        "peer_id": "",
        "last_hash": "genesis",
        "pending_events": -1,
        "snapshot_version": 0,
    }
    with pytest.raises(ValueError, match="peer_id"):
        runtime.parse_peer_sync_metadata(bad)
