import base64
import json

from nacl.signing import SigningKey

from blackout_runtime.envelope import EventEnvelope


def _payload(key: str, value: str) -> str:
    return base64.b64encode(
        json.dumps({"key": key, "value": value}).encode("utf-8")
    ).decode("ascii")


def test_signed_hash_linked_envelope_verification() -> None:
    key = SigningKey.generate()

    first = EventEnvelope.create(
        signing_key=key,
        event_type="MESSAGE_CREATED",
        encrypted_payload=_payload("a", "1"),
        previous_hash="genesis",
        room_id="!room:test",
        crdt_site="peer-a",
        crdt_counter=1,
    )

    second = EventEnvelope.create(
        signing_key=key,
        event_type="MESSAGE_CREATED",
        encrypted_payload=_payload("b", "2"),
        previous_hash=first.digest(),
        room_id="!room:test",
        crdt_site="peer-a",
        crdt_counter=2,
    )

    assert first.verify_signature()
    assert second.verify_signature()
    assert second.verify_previous_hash(first.digest())
