from __future__ import annotations

import base64
import hashlib
import json
import time
import uuid
from dataclasses import dataclass
from typing import Mapping

from nacl.exceptions import BadSignatureError
from nacl.signing import SigningKey, VerifyKey


def _canonical_json(payload: Mapping[str, object]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")


def generate_event_id() -> str:
    return f"evt_{uuid.uuid4().hex}"


@dataclass(frozen=True)
class EventEnvelope:
    """Signed hash-linked envelope used by blackout event replay paths."""

    event_id: str
    event_type: str
    timestamp: int
    actor_public_key: str
    encrypted_payload: str
    previous_hash: str
    room_id: str
    crdt_site: str
    crdt_counter: int
    signature: str

    @classmethod
    def create(
        cls,
        *,
        signing_key: SigningKey,
        event_type: str,
        encrypted_payload: str,
        previous_hash: str,
        room_id: str,
        crdt_site: str,
        crdt_counter: int,
    ) -> "EventEnvelope":
        actor_public_key = base64.b64encode(signing_key.verify_key.encode()).decode(
            "ascii"
        )
        event_id = generate_event_id()
        timestamp = int(time.time())

        body = {
            "event_id": event_id,
            "event_type": event_type,
            "timestamp": timestamp,
            "actor_public_key": actor_public_key,
            "encrypted_payload": encrypted_payload,
            "previous_hash": previous_hash,
            "room_id": room_id,
            "crdt_site": crdt_site,
            "crdt_counter": crdt_counter,
        }
        signature = base64.b64encode(
            signing_key.sign(_canonical_json(body)).signature
        ).decode("ascii")

        return cls(
            event_id=event_id,
            event_type=event_type,
            timestamp=timestamp,
            actor_public_key=actor_public_key,
            encrypted_payload=encrypted_payload,
            previous_hash=previous_hash,
            room_id=room_id,
            crdt_site=crdt_site,
            crdt_counter=crdt_counter,
            signature=signature,
        )

    def body_dict(self) -> Mapping[str, object]:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "timestamp": self.timestamp,
            "actor_public_key": self.actor_public_key,
            "encrypted_payload": self.encrypted_payload,
            "previous_hash": self.previous_hash,
            "room_id": self.room_id,
            "crdt_site": self.crdt_site,
            "crdt_counter": self.crdt_counter,
        }

    def digest(self) -> str:
        return "sha256:" + hashlib.sha256(_canonical_json(self.body_dict())).hexdigest()

    def verify_signature(self) -> bool:
        verify_key = VerifyKey(base64.b64decode(self.actor_public_key))
        try:
            verify_key.verify(
                _canonical_json(self.body_dict()),
                base64.b64decode(self.signature),
            )
        except BadSignatureError:
            return False
        return True

    def verify_previous_hash(self, expected_previous_hash: str) -> bool:
        return self.previous_hash == expected_previous_hash
