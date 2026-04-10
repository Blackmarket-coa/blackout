from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional

from .crdt import AutomergePrototypeCRDT, CRDTOperation
from .envelope import EventEnvelope


@dataclass
class LowMemoryProfile:
    max_pending_events: int = 2048
    max_snapshot_bytes: int = 4 * 1024 * 1024
    replay_batch_size: int = 256


@dataclass(frozen=True)
class PeerSyncMetadata:
    peer_id: str
    last_hash: str
    pending_events: int
    snapshot_version: int


class BlackoutNodeRuntime:
    """Snapshot + replay boot and offline rejoin recovery runtime path."""

    def __init__(self, profile: Optional[LowMemoryProfile] = None) -> None:
        self.profile = profile or LowMemoryProfile()
        self.crdt = AutomergePrototypeCRDT()
        self._event_log: List[EventEnvelope] = []

    def boot_from_snapshot_and_replay(
        self, *, snapshot: dict, replay_events: Iterable[EventEnvelope]
    ) -> None:
        self.crdt.import_snapshot(snapshot)
        self._event_log = []

        expected_previous_hash = "genesis"
        for event in replay_events:
            if not event.verify_signature():
                raise ValueError(f"Invalid event signature for {event.event_id}")
            if not event.verify_previous_hash(expected_previous_hash):
                raise ValueError(
                    f"Broken hash chain for {event.event_id}: expected {expected_previous_hash}, got {event.previous_hash}"
                )
            self._apply_event(event)
            expected_previous_hash = event.digest()

    def recover_offline_rejoin(
        self, *, last_known_hash: str, peer_events: Iterable[EventEnvelope]
    ) -> int:
        buffered = list(peer_events)
        if len(buffered) > self.profile.max_pending_events:
            raise ValueError("Peer replay set exceeds low-memory pending-event budget")

        start_index = 0
        if last_known_hash != "genesis":
            for index, event in enumerate(buffered):
                if event.previous_hash == last_known_hash:
                    start_index = index
                    break
            else:
                raise ValueError(
                    "Unable to locate replay starting point from peer events"
                )

        expected_previous_hash = last_known_hash
        applied = 0
        for event in buffered[start_index:]:
            if not event.verify_signature() or not event.verify_previous_hash(
                expected_previous_hash
            ):
                continue
            self._apply_event(event)
            expected_previous_hash = event.digest()
            applied += 1
        return applied

    def build_peer_sync_metadata(
        self,
        *,
        peer_id: str,
        snapshot_version: int,
    ) -> Dict[str, Any]:
        metadata = PeerSyncMetadata(
            peer_id=peer_id,
            last_hash=self.last_hash(),
            pending_events=len(self._event_log),
            snapshot_version=snapshot_version,
        )
        return {
            "peer_id": metadata.peer_id,
            "last_hash": metadata.last_hash,
            "pending_events": metadata.pending_events,
            "snapshot_version": metadata.snapshot_version,
        }

    @staticmethod
    def parse_peer_sync_metadata(payload: Dict[str, Any]) -> PeerSyncMetadata:
        peer_id = payload.get("peer_id")
        last_hash = payload.get("last_hash")
        pending_events = payload.get("pending_events")
        snapshot_version = payload.get("snapshot_version")

        if not isinstance(peer_id, str) or not peer_id:
            raise ValueError("peer sync metadata requires non-empty peer_id")
        if not isinstance(last_hash, str) or not last_hash:
            raise ValueError("peer sync metadata requires non-empty last_hash")
        if not isinstance(pending_events, int) or pending_events < 0:
            raise ValueError("peer sync metadata requires non-negative pending_events")
        if not isinstance(snapshot_version, int) or snapshot_version < 1:
            raise ValueError("peer sync metadata requires positive snapshot_version")

        return PeerSyncMetadata(
            peer_id=peer_id,
            last_hash=last_hash,
            pending_events=pending_events,
            snapshot_version=snapshot_version,
        )

    def build_bootstrap_recovery_envelope(
        self, *, peer_id: str, snapshot_version: int
    ) -> Dict[str, Any]:
        metadata = self.build_peer_sync_metadata(
            peer_id=peer_id,
            snapshot_version=snapshot_version,
        )
        return {
            "metadata": metadata,
            "events": [
                {
                    "event_id": event.event_id,
                    "event_type": event.event_type,
                    "timestamp": event.timestamp,
                    "actor_public_key": event.actor_public_key,
                    "encrypted_payload": event.encrypted_payload,
                    "previous_hash": event.previous_hash,
                    "room_id": event.room_id,
                    "crdt_site": event.crdt_site,
                    "crdt_counter": event.crdt_counter,
                    "signature": event.signature,
                }
                for event in self._event_log[-self.profile.replay_batch_size :]
            ],
        }

    def recover_from_bootstrap_recovery_envelope(
        self, *, envelope: Dict[str, Any]
    ) -> int:
        metadata_raw = envelope.get("metadata")
        events_raw = envelope.get("events")
        if not isinstance(metadata_raw, dict):
            raise ValueError("bootstrap envelope requires metadata object")
        if not isinstance(events_raw, list):
            raise ValueError("bootstrap envelope requires events list")

        metadata = self.parse_peer_sync_metadata(metadata_raw)
        events: List[EventEnvelope] = []
        for item in events_raw:
            if not isinstance(item, dict):
                raise ValueError("bootstrap envelope events must be JSON objects")
            events.append(
                EventEnvelope(
                    event_id=str(item["event_id"]),
                    event_type=str(item["event_type"]),
                    timestamp=int(item["timestamp"]),
                    actor_public_key=str(item["actor_public_key"]),
                    encrypted_payload=str(item["encrypted_payload"]),
                    previous_hash=str(item["previous_hash"]),
                    room_id=str(item["room_id"]),
                    crdt_site=str(item["crdt_site"]),
                    crdt_counter=int(item["crdt_counter"]),
                    signature=str(item["signature"]),
                )
            )

        return self.recover_offline_rejoin(
            last_known_hash=metadata.last_hash,
            peer_events=events,
        )

    def export_snapshot(self) -> dict:
        snapshot = self.crdt.snapshot()
        encoded = json.dumps(snapshot).encode("utf-8")
        if len(encoded) > self.profile.max_snapshot_bytes:
            raise ValueError("Snapshot exceeds low-memory profile target")
        return snapshot

    def last_hash(self) -> str:
        if not self._event_log:
            return "genesis"
        return self._event_log[-1].digest()

    def _apply_event(self, event: EventEnvelope) -> None:
        payload = json.loads(base64.b64decode(event.encrypted_payload).decode("utf-8"))
        self.crdt.apply(
            CRDTOperation(
                key=str(payload["key"]),
                value=str(payload["value"]),
                site=event.crdt_site,
                counter=event.crdt_counter,
            )
        )
        self._event_log.append(event)
