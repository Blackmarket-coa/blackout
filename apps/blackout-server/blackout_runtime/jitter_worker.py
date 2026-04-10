from __future__ import annotations

import random
from dataclasses import dataclass
from typing import List, MutableMapping, Sequence


@dataclass(frozen=True)
class QueuedEvent:
    event_id: str
    room_id: str
    queued_at_ms: int
    release_at_ms: int


class JitterBatchWorker:
    """Feature-flag-friendly jitter batching skeleton for BO-401/402.

    This helper is intentionally pure-python to support deterministic tests and
    staged integration behind runtime feature flags.
    """

    def __init__(
        self, *, min_delay_ms: int, max_delay_ms: int, max_batch_size: int = 100
    ) -> None:
        if min_delay_ms < 0 or max_delay_ms < min_delay_ms:
            raise ValueError("invalid jitter bounds")
        if max_batch_size < 1:
            raise ValueError("max_batch_size must be >= 1")

        self._min_delay_ms = min_delay_ms
        self._max_delay_ms = max_delay_ms
        self._max_batch_size = max_batch_size
        self._queue: List[QueuedEvent] = []

    def enqueue(self, *, event_id: str, room_id: str, now_ms: int) -> QueuedEvent:
        delay_ms = random.randint(self._min_delay_ms, self._max_delay_ms)
        queued = QueuedEvent(
            event_id=event_id,
            room_id=room_id,
            queued_at_ms=now_ms,
            release_at_ms=now_ms + delay_ms,
        )
        self._queue.append(queued)
        return queued

    def flush_due(self, *, now_ms: int) -> Sequence[QueuedEvent]:
        due = [q for q in self._queue if q.release_at_ms <= now_ms]
        due.sort(key=lambda q: q.release_at_ms)
        selected = due[: self._max_batch_size]
        selected_ids = {q.event_id for q in selected}
        self._queue = [q for q in self._queue if q.event_id not in selected_ids]
        return selected

    def stats(self) -> MutableMapping[str, int]:
        return {
            "queued": len(self._queue),
            "min_delay_ms": self._min_delay_ms,
            "max_delay_ms": self._max_delay_ms,
            "max_batch_size": self._max_batch_size,
        }
