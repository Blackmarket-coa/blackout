from __future__ import annotations

import math
import re
import statistics
import time
from dataclasses import dataclass, field
from difflib import get_close_matches
from typing import Callable, Dict, Iterable, List, Mapping, MutableMapping, Optional, Sequence, Set

TOKEN_RE = re.compile(r"[a-z0-9']+")


@dataclass(frozen=True)
class AttachmentMetadata:
    attachment_id: str
    filename: str
    mimetype: str
    size_bytes: int


@dataclass
class IndexedMessage:
    message_id: str
    text: str
    author: str
    channel: str
    created_at: int
    updated_at: int
    attachments: List[AttachmentMetadata] = field(default_factory=list)
    deleted_at: Optional[int] = None
    retention_until: Optional[int] = None


@dataclass(frozen=True)
class SearchFilters:
    keyword: Optional[str] = None
    phrase: Optional[str] = None
    author: Optional[str] = None
    channel: Optional[str] = None
    date_start: Optional[int] = None
    date_end: Optional[int] = None


@dataclass(frozen=True)
class SearchResult:
    message_id: str
    score: float
    text: str
    author: str
    channel: str
    created_at: int
    updated_at: int
    attachments: Sequence[AttachmentMetadata]
    snippet: str


@dataclass(frozen=True)
class SearchPage:
    total: int
    page: int
    page_size: int
    results: Sequence[SearchResult]


@dataclass(frozen=True)
class RelevanceTuning:
    exact_token_boost: float = 1.0
    phrase_boost: float = 2.5
    recency_boost: float = 0.4
    typo_penalty: float = 0.35


class MessageIndexPipeline:
    """In-memory message indexing pipeline with ACL-enforced querying."""

    def __init__(
        self,
        *,
        acl_resolver: Callable[[str], Set[str]],
        relevance: Optional[RelevanceTuning] = None,
    ) -> None:
        self._acl_resolver = acl_resolver
        self._relevance = relevance or RelevanceTuning()
        self._messages: MutableMapping[str, IndexedMessage] = {}
        self._inverted: Dict[str, Set[str]] = {}
        self._channel_index: Dict[str, Set[str]] = {}
        self._author_index: Dict[str, Set[str]] = {}

    def process_event(self, *, event_type: str, payload: Mapping[str, object]) -> None:
        if event_type in {"new", "edit"}:
            msg = self._message_from_payload(payload)
            self._upsert(msg)
            return
        if event_type == "delete":
            message_id = payload.get("message_id")
            deleted_at = payload.get("deleted_at")
            if isinstance(message_id, str) and isinstance(deleted_at, int):
                self._mark_deleted(message_id=message_id, deleted_at=deleted_at)
                self.sync_retention(now_ms=deleted_at)
            return
        raise ValueError(f"unsupported event type {event_type}")

    def sync_retention(self, *, now_ms: int) -> int:
        removed = 0
        for message_id, msg in list(self._messages.items()):
            should_remove = bool(msg.deleted_at and msg.deleted_at <= now_ms)
            should_expire = bool(msg.retention_until and msg.retention_until <= now_ms)
            if should_remove or should_expire:
                self._deindex(message_id, msg)
                del self._messages[message_id]
                removed += 1
        return removed

    def query(
        self,
        *,
        user_id: str,
        filters: SearchFilters,
        page: int = 1,
        page_size: int = 20,
        typo_tolerance: bool = True,
    ) -> SearchPage:
        if page < 1:
            raise ValueError("page must be >= 1")
        if page_size < 1:
            raise ValueError("page_size must be >= 1")

        allowed_channels = self._acl_resolver(user_id)
        candidate_ids = self._candidate_ids(filters=filters, typo_tolerance=typo_tolerance)
        scoped_ids = [
            mid
            for mid in candidate_ids
            if (msg := self._messages.get(mid))
            and msg.channel in allowed_channels
            and self._matches_filters(msg, filters)
        ]

        scored = sorted(
            (
                self._to_result(msg=self._messages[mid], filters=filters)
                for mid in scoped_ids
                if mid in self._messages
            ),
            key=lambda item: item.score,
            reverse=True,
        )

        total = len(scored)
        start = (page - 1) * page_size
        end = start + page_size
        return SearchPage(
            total=total,
            page=page,
            page_size=page_size,
            results=scored[start:end],
        )

    def _candidate_ids(self, *, filters: SearchFilters, typo_tolerance: bool) -> Set[str]:
        if not filters.keyword and not filters.phrase and not filters.author and not filters.channel:
            return set(self._messages.keys())

        candidates: Optional[Set[str]] = None

        if filters.keyword:
            tokens = self._tokenize(filters.keyword)
            keyword_ids: Set[str] = set()
            for token in tokens:
                keyword_ids.update(self._inverted.get(token, set()))
                if typo_tolerance:
                    for near in get_close_matches(token, self._inverted.keys(), n=5, cutoff=0.82):
                        keyword_ids.update(self._inverted.get(near, set()))
            candidates = keyword_ids if candidates is None else candidates & keyword_ids

        if filters.author:
            author_ids = set(self._author_index.get(filters.author, set()))
            candidates = author_ids if candidates is None else candidates & author_ids

        if filters.channel:
            channel_ids = set(self._channel_index.get(filters.channel, set()))
            candidates = channel_ids if candidates is None else candidates & channel_ids

        if filters.phrase:
            phrase = filters.phrase.lower()
            phrase_ids = {
                mid
                for mid, msg in self._messages.items()
                if phrase in msg.text.lower()
            }
            candidates = phrase_ids if candidates is None else candidates & phrase_ids

        return candidates or set()

    def _matches_filters(self, msg: IndexedMessage, filters: SearchFilters) -> bool:
        if filters.author and msg.author != filters.author:
            return False
        if filters.channel and msg.channel != filters.channel:
            return False
        if filters.date_start and msg.created_at < filters.date_start:
            return False
        if filters.date_end and msg.created_at > filters.date_end:
            return False
        if filters.phrase and filters.phrase.lower() not in msg.text.lower():
            return False
        return True

    def _to_result(self, *, msg: IndexedMessage, filters: SearchFilters) -> SearchResult:
        text_lower = msg.text.lower()
        score = 0.0
        if filters.keyword:
            for token in self._tokenize(filters.keyword):
                if token in text_lower:
                    score += self._relevance.exact_token_boost
                else:
                    nearest = get_close_matches(token, self._tokenize(text_lower), n=1, cutoff=0.85)
                    if nearest:
                        score += self._relevance.exact_token_boost * self._relevance.typo_penalty

        if filters.phrase and filters.phrase.lower() in text_lower:
            score += self._relevance.phrase_boost

        now_ms = int(time.time() * 1000)
        age_days = max((now_ms - msg.updated_at) / 86_400_000, 0)
        score += self._relevance.recency_boost / (1 + math.log1p(age_days))

        snippet = self._snippet(msg.text, filters)
        return SearchResult(
            message_id=msg.message_id,
            score=score,
            text=msg.text,
            author=msg.author,
            channel=msg.channel,
            created_at=msg.created_at,
            updated_at=msg.updated_at,
            attachments=tuple(msg.attachments),
            snippet=snippet,
        )

    def _snippet(self, text: str, filters: SearchFilters, radius: int = 42) -> str:
        cue = (filters.phrase or filters.keyword or "").strip()
        if not cue:
            return text[: radius * 2]
        low_text = text.lower()
        low_cue = cue.lower()
        idx = low_text.find(low_cue)
        if idx < 0:
            return text[: radius * 2]
        start = max(0, idx - radius)
        end = min(len(text), idx + len(cue) + radius)
        raw = text[start:end]
        return re.sub(re.escape(cue), f"<em>{cue}</em>", raw, flags=re.IGNORECASE)

    def _message_from_payload(self, payload: Mapping[str, object]) -> IndexedMessage:
        message_id = payload.get("message_id")
        text = payload.get("text")
        author = payload.get("author")
        channel = payload.get("channel")
        created_at = payload.get("created_at")
        updated_at = payload.get("updated_at")
        if not all(isinstance(v, str) for v in (message_id, text, author, channel)):
            raise ValueError("message payload is missing required text fields")
        if not isinstance(created_at, int) or not isinstance(updated_at, int):
            raise ValueError("message payload requires integer timestamps")

        attachments: List[AttachmentMetadata] = []
        for item in payload.get("attachments", []):
            if not isinstance(item, Mapping):
                continue
            attachment_id = item.get("attachment_id")
            filename = item.get("filename")
            mimetype = item.get("mimetype")
            size_bytes = item.get("size_bytes")
            if (
                isinstance(attachment_id, str)
                and isinstance(filename, str)
                and isinstance(mimetype, str)
                and isinstance(size_bytes, int)
            ):
                attachments.append(
                    AttachmentMetadata(
                        attachment_id=attachment_id,
                        filename=filename,
                        mimetype=mimetype,
                        size_bytes=size_bytes,
                    )
                )

        retention_until = payload.get("retention_until")
        if retention_until is not None and not isinstance(retention_until, int):
            raise ValueError("retention_until must be integer milliseconds")

        return IndexedMessage(
            message_id=message_id,
            text=text,
            author=author,
            channel=channel,
            created_at=created_at,
            updated_at=updated_at,
            attachments=attachments,
            retention_until=retention_until,
        )

    def _mark_deleted(self, *, message_id: str, deleted_at: int) -> None:
        existing = self._messages.get(message_id)
        if not existing:
            return
        existing.deleted_at = deleted_at

    def _upsert(self, message: IndexedMessage) -> None:
        previous = self._messages.get(message.message_id)
        if previous:
            self._deindex(message.message_id, previous)
        self._messages[message.message_id] = message
        self._index(message)

    def _index(self, message: IndexedMessage) -> None:
        for token in self._tokenize(message.text):
            self._inverted.setdefault(token, set()).add(message.message_id)
        self._channel_index.setdefault(message.channel, set()).add(message.message_id)
        self._author_index.setdefault(message.author, set()).add(message.message_id)

    def _deindex(self, message_id: str, message: IndexedMessage) -> None:
        for token in self._tokenize(message.text):
            ids = self._inverted.get(token)
            if not ids:
                continue
            ids.discard(message_id)
            if not ids:
                self._inverted.pop(token, None)

        for index, key in ((self._channel_index, message.channel), (self._author_index, message.author)):
            ids = index.get(key)
            if not ids:
                continue
            ids.discard(message_id)
            if not ids:
                index.pop(key, None)

    @staticmethod
    def _tokenize(text: str) -> List[str]:
        return TOKEN_RE.findall(text.lower())


def benchmark_high_volume_canopies(
    *,
    index: MessageIndexPipeline,
    canopy_count: int = 20,
    messages_per_canopy: int = 2_500,
) -> Mapping[str, float]:
    """Synthetic benchmark for large message canopies."""
    now = int(time.time() * 1000)
    started = time.perf_counter()

    for canopy in range(canopy_count):
        channel = f"canopy-{canopy}"
        for message_num in range(messages_per_canopy):
            body = f"thermal canopy alert {canopy} sensor {message_num} drift"
            index.process_event(
                event_type="new",
                payload={
                    "message_id": f"{channel}-{message_num}",
                    "text": body,
                    "author": f"@operator{message_num % 11}:test",
                    "channel": channel,
                    "created_at": now - message_num,
                    "updated_at": now - message_num,
                    "attachments": [],
                },
            )

    ingest_seconds = time.perf_counter() - started

    latencies: List[float] = []
    for canopy in range(min(6, canopy_count)):
        q_start = time.perf_counter()
        index.query(
            user_id="@bench:test",
            filters=SearchFilters(keyword="aler", phrase="sensor", channel=f"canopy-{canopy}"),
            page=1,
            page_size=25,
            typo_tolerance=True,
        )
        latencies.append((time.perf_counter() - q_start) * 1000)

    return {
        "ingested_messages": float(canopy_count * messages_per_canopy),
        "ingest_seconds": ingest_seconds,
        "query_p50_ms": statistics.median(latencies),
        "query_p95_ms": max(latencies),
    }
