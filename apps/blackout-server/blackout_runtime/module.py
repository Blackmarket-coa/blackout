from __future__ import annotations

import json
import hashlib
import hmac
import sqlite3
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
from typing import (
    Any,
    Deque,
    Dict,
    List,
    Mapping,
    MutableMapping,
    Optional,
    Sequence,
    Set,
    Tuple,
    cast,
)

from twisted.web.resource import Resource

from synapse.api.errors import Codes, SynapseError
from synapse.http.server import DirectServeJsonResource
from synapse.http.site import SynapseRequest
from synapse.types import JsonDict, StateMap

from .server_semantics import (
    ANNOUNCEMENT_POLICY_EVENT,
    ATTESTATION_EVENT,
    BLACKOUT_CHANNEL_TYPE_EVENT,
    DELEGATION_GRANT_EVENT,
    DELIBERATION_EXECUTION_EVENT,
    DELIBERATION_PROPOSAL_EVENT,
    DELIBERATION_VOTE_EVENT,
    GOVERNANCE_ATTESTATION_EVENT,
    GOVERNANCE_PROPOSAL_EVENT,
    GOVERNANCE_VOTE_EVENT,
    BOOST_STATE_EVENT,
    PAID_ROOM_STATE_EVENT,
    REPUTATION_UPDATE_EVENT,
    STEGO_POLICY_EVENT,
    TOWNHALL_AGENDA_EVENT,
    TOWNHALL_SESSION_EVENT,
    TOWNHALL_SUMMARY_EVENT,
    BlackoutPresenceService,
    BlackoutServerSemantics,
    MIGRATION_BLOCKED_EVENT_TYPES,
)

BLACKOUT_PRESENCE_ACCOUNT_DATA_TYPE = "m.blackout.presence"
DEAD_DROP_CHANNEL_TYPE = "blackout_dead_drop_room"
ANNOUNCEMENT_CHANNEL_TYPE = "blackout_announcement_room"
DEAD_DROP_MESSAGE_EVENT_TYPE = "m.room.message"
ANNOUNCEMENT_MESSAGE_EVENT_TYPE = "m.room.message"
ROOM_MEMBER_EVENT_TYPE = "m.room.member"
BLACKOUT_SIGNAL_EVENT_TYPE = "m.blackout.signal"
STEGO_ENTITLEMENTS_EVENT_TYPE = "m.blackout.entitlements"
PLUGIN_POLICY_EVENT_TYPE = "m.blackout.plugin.policy"
PLUGIN_REGISTER_EVENT_TYPE = "m.blackout.plugin.register"
RUNTIME_EXTENSION_EVENT_TYPE = "m.blackout.runtime.extension"


@dataclass
class GovernanceDecision:
    token: int
    room_id: str
    event_id: str
    proposal_id: str
    decision: str
    finalized_at: int | None


class GovernanceDecisionStore:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn
        self._next_token = 1
        self._decisions: List[GovernanceDecision] = []
        self._seen_event_ids: Set[str] = set()
        self._voter_registry: Set[Tuple[str, str, str]] = set()
        self._load()

    def _load(self) -> None:
        rows = self._conn.execute(
            "SELECT token, room_id, event_id, proposal_id, decision, finalized_at, sender FROM blackout_governance_decisions ORDER BY token ASC"
        ).fetchall()
        for (
            token,
            room_id,
            event_id,
            proposal_id,
            decision,
            finalized_at,
            sender,
        ) in rows:
            self._decisions.append(
                GovernanceDecision(
                    token, room_id, event_id, proposal_id, decision, finalized_at
                )
            )
            self._seen_event_ids.add(event_id)
            self._voter_registry.add((room_id, proposal_id, sender))

        if self._decisions:
            self._next_token = self._decisions[-1].token + 1

    def has_voted(self, room_id: str, proposal_id: str, sender: str) -> bool:
        return (room_id, proposal_id, sender) in self._voter_registry

    def ingest_event(self, event: Any) -> bool:
        if (
            event.type != GOVERNANCE_VOTE_EVENT
            or event.event_id in self._seen_event_ids
        ):
            return False

        content = event.content
        if not isinstance(content, Mapping):
            return False

        proposal_id = content.get("proposal_id")
        decision = (
            content.get("decision") or content.get("result") or content.get("outcome")
        )
        sender = getattr(event, "sender", "")
        if not isinstance(proposal_id, str) or not proposal_id:
            return False
        if not isinstance(sender, str) or not sender:
            return False

        self._voter_registry.add((event.room_id, proposal_id, sender))

        if not isinstance(decision, str) or not decision:
            self._seen_event_ids.add(event.event_id)
            return False

        record = GovernanceDecision(
            token=self._next_token,
            room_id=event.room_id,
            event_id=event.event_id,
            proposal_id=proposal_id,
            decision=decision,
            finalized_at=getattr(event, "origin_server_ts", None),
        )
        self._decisions.append(record)
        self._seen_event_ids.add(event.event_id)
        self._next_token += 1

        self._conn.execute(
            "INSERT OR IGNORE INTO blackout_governance_decisions (token, room_id, event_id, proposal_id, decision, finalized_at, sender) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                record.token,
                record.room_id,
                record.event_id,
                record.proposal_id,
                record.decision,
                record.finalized_at,
                sender,
            ),
        )
        self._conn.commit()
        return True

    def query(self, *, room_id: str, since: int) -> tuple[int, List[JsonDict]]:
        results = [
            {
                "token": d.token,
                "room_id": d.room_id,
                "event_id": d.event_id,
                "proposal_id": d.proposal_id,
                "decision": d.decision,
                "finalized_at": d.finalized_at,
            }
            for d in self._decisions
            if d.room_id == room_id and d.token > since
        ]
        return self._next_token - 1, results


class GovernanceProposalStore:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn
        self._windows: Dict[Tuple[str, str], Tuple[int, int]] = {}
        self._load()

    def _load(self) -> None:
        rows = self._conn.execute(
            "SELECT room_id, proposal_id, opens_at, closes_at FROM blackout_governance_proposals"
        ).fetchall()
        for room_id, proposal_id, opens_at, closes_at in rows:
            self._windows[(room_id, proposal_id)] = (int(opens_at), int(closes_at))

    def ingest_event(self, event: Any) -> bool:
        if event.type != GOVERNANCE_PROPOSAL_EVENT:
            return False

        content = event.content
        if not isinstance(content, Mapping):
            return False

        proposal_id = content.get("proposal_id")
        opens_at = content.get("opens_at")
        closes_at = content.get("closes_at")
        if (
            not isinstance(proposal_id, str)
            or not proposal_id
            or not isinstance(opens_at, int)
            or not isinstance(closes_at, int)
            or closes_at <= opens_at
        ):
            return False

        key = (event.room_id, proposal_id)
        self._windows[key] = (opens_at, closes_at)
        self._conn.execute(
            "INSERT OR REPLACE INTO blackout_governance_proposals (room_id, proposal_id, opens_at, closes_at) VALUES (?, ?, ?, ?)",
            (event.room_id, proposal_id, opens_at, closes_at),
        )
        self._conn.commit()
        return True

    def vote_window_for(self, room_id: str, proposal_id: str) -> Optional[Tuple[int, int]]:
        return self._windows.get((room_id, proposal_id))


class ReputationStore:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn
        self._stats: Dict[str, Dict[str, object]] = {}
        self._cache: Dict[str, Dict[str, object]] = {}
        self._last_cache_ms: Dict[str, int] = {}
        self._cache_ttl_ms = 30_000
        self._seen_event_ids: Set[str] = set()
        self._load()

    def _load(self) -> None:
        rows = self._conn.execute(
            "SELECT event_id, node_id, delta, reason, rating, attestation_status, governance_standing FROM blackout_reputation_updates ORDER BY rowid ASC"
        ).fetchall()
        for row in rows:
            (
                event_id,
                node_id,
                delta,
                reason,
                rating,
                attestation_status,
                governance_standing,
            ) = row
            self._seen_event_ids.add(event_id)
            self._apply(
                {
                    "event_id": event_id,
                    "content": {
                        "node_id": node_id,
                        "delta": delta,
                        "reason": reason,
                        "rating": rating,
                        "attestation_status": attestation_status,
                        "governance_standing": governance_standing,
                    },
                }
            )

    def _apply(self, event: Mapping[str, object]) -> bool:
        content = event.get("content")
        if not isinstance(content, Mapping):
            return False
        node_id = content.get("node_id")
        delta = content.get("delta")
        reason = content.get("reason")
        if not isinstance(node_id, str) or not node_id:
            return False
        if not isinstance(delta, (int, float)):
            return False
        if not isinstance(reason, str) or not reason:
            return False

        current = cast(
            Dict[str, object],
            self._stats.setdefault(
                node_id,
                {
                    "node_id": node_id,
                    "events": 0,
                    "total_delta": 0.0,
                    "delivery_success_count": 0,
                    "delivery_event_count": 0,
                    "rating_sum": 0.0,
                    "rating_count": 0,
                    "attestation_status": "unknown",
                    "governance_standing": "unknown",
                },
            ),
        )

        current["events"] = int(current["events"]) + 1
        current["total_delta"] = float(current["total_delta"]) + float(delta)
        if reason.startswith("delivery"):
            current["delivery_event_count"] = int(current["delivery_event_count"]) + 1
            if float(delta) > 0:
                current["delivery_success_count"] = (
                    int(current["delivery_success_count"]) + 1
                )

        rating = content.get("rating")
        if isinstance(rating, (int, float)):
            current["rating_sum"] = float(current["rating_sum"]) + float(rating)
            current["rating_count"] = int(current["rating_count"]) + 1

        attestation_status = content.get("attestation_status")
        if isinstance(attestation_status, str) and attestation_status:
            current["attestation_status"] = attestation_status
        governance_standing = content.get("governance_standing")
        if isinstance(governance_standing, str) and governance_standing:
            current["governance_standing"] = governance_standing

        self._cache.pop(node_id, None)
        self._last_cache_ms.pop(node_id, None)
        return True

    def ingest_event(self, event: Any) -> bool:
        if (
            event.type != REPUTATION_UPDATE_EVENT
            or event.event_id in self._seen_event_ids
        ):
            return False
        if not self._apply({"content": event.content}):
            return False

        content = cast(Mapping[str, object], event.content)
        self._conn.execute(
            "INSERT OR IGNORE INTO blackout_reputation_updates (event_id, node_id, delta, reason, rating, attestation_status, governance_standing) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                event.event_id,
                content.get("node_id"),
                float(content.get("delta")),
                content.get("reason"),
                content.get("rating")
                if isinstance(content.get("rating"), (int, float))
                else None,
                content.get("attestation_status")
                if isinstance(content.get("attestation_status"), str)
                else None,
                content.get("governance_standing")
                if isinstance(content.get("governance_standing"), str)
                else None,
            ),
        )
        self._conn.commit()
        self._seen_event_ids.add(event.event_id)
        return True

    def get(self, node_id: str) -> JsonDict:
        now_ms = int(time.time() * 1000)
        cached = self._cache.get(node_id)
        last_ms = self._last_cache_ms.get(node_id)
        if (
            cached is not None
            and last_ms is not None
            and now_ms - last_ms < self._cache_ttl_ms
        ):
            return dict(cached)

        current = self._stats.get(node_id)
        if current is None:
            result: JsonDict = {
                "node_id": node_id,
                "events": 0,
                "score": 0.0,
                "delivery_success_rate": None,
                "average_rating": None,
                "attestation_status": "unknown",
                "governance_standing": "unknown",
                "computed_at": now_ms,
                "cache_ttl_ms": self._cache_ttl_ms,
            }
        else:
            delivery_events = int(current["delivery_event_count"])
            delivery_success = int(current["delivery_success_count"])
            rating_count = int(current["rating_count"])
            rating_sum = float(current["rating_sum"])
            result = {
                "node_id": node_id,
                "events": int(current["events"]),
                "score": round(float(current["total_delta"]), 4),
                "delivery_success_rate": delivery_success / delivery_events
                if delivery_events
                else None,
                "average_rating": rating_sum / rating_count if rating_count else None,
                "attestation_status": str(current["attestation_status"]),
                "governance_standing": str(current["governance_standing"]),
                "computed_at": now_ms,
                "cache_ttl_ms": self._cache_ttl_ms,
            }

        self._cache[node_id] = dict(result)
        self._last_cache_ms[node_id] = now_ms
        return result


class BlackoutPresenceResource(DirectServeJsonResource):
    def __init__(self, module_api: Any, presence: BlackoutPresenceService):
        super().__init__()
        self._module_api = module_api
        self._presence = presence

    async def _async_render_GET(self, request: SynapseRequest) -> tuple[int, JsonDict]:
        requester = await self._module_api.get_user_by_req(request)
        user_id = requester.user.to_string()

        state = self._presence.get_presence(user_id)
        if state is None:
            stored = await self._module_api.account_data_manager.get_global(
                user_id, BLACKOUT_PRESENCE_ACCOUNT_DATA_TYPE
            )
            if isinstance(stored, Mapping):
                stored_state = stored.get("state")
                if isinstance(stored_state, str):
                    self._presence.set_presence(user_id, stored_state)
                    state = stored_state

        return 200, {"user_id": user_id, "state": state}

    async def _async_render_PUT(self, request: SynapseRequest) -> tuple[int, JsonDict]:
        requester = await self._module_api.get_user_by_req(request)
        user_id = requester.user.to_string()

        body = _parse_json_body(request)
        state = body.get("state")
        if not isinstance(state, str):
            raise SynapseError(400, "Request body must include string field 'state'")

        try:
            self._presence.set_presence(user_id, state)
        except ValueError as exc:
            raise SynapseError(400, str(exc))

        await self._module_api.account_data_manager.put_global(
            user_id,
            BLACKOUT_PRESENCE_ACCOUNT_DATA_TYPE,
            {"state": state},
        )

        return 200, {"user_id": user_id, "state": state}


class GovernanceDecisionsResource(DirectServeJsonResource):
    def __init__(self, module_api: Any, module: "BlackoutRuntimeModule"):
        super().__init__()
        self._module_api = module_api
        self._module = module

    async def _async_render_GET(self, request: SynapseRequest) -> tuple[int, JsonDict]:
        await self._module_api.get_user_by_req(request)

        room_id = _parse_query_arg(request, "room_id", required=True)
        assert room_id is not None
        since_raw = _parse_query_arg(request, "since", required=False) or "0"

        try:
            since = int(since_raw)
        except ValueError as exc:
            raise SynapseError(400, "since must be an integer") from exc

        await self._module.backfill_room(room_id)
        next_since, decisions = self._module._decisions.query(
            room_id=room_id, since=since
        )
        return 200, {
            "room_id": room_id,
            "since": since,
            "next_since": next_since,
            "decisions": decisions,
        }


class NodeReputationResource(DirectServeJsonResource):
    def __init__(self, module_api: Any, module: "BlackoutRuntimeModule", node_id: str):
        super().__init__()
        self._module_api = module_api
        self._module = module
        self._node_id = node_id

    async def _async_render_GET(self, request: SynapseRequest) -> tuple[int, JsonDict]:
        await self._module_api.get_user_by_req(request)
        await self._module.backfill_node(self._node_id)
        return 200, self._module._reputation.get(self._node_id)


class ReputationRootResource(Resource):
    isLeaf = False

    def __init__(self, module_api: Any, module: "BlackoutRuntimeModule"):
        super().__init__()
        self._module_api = module_api
        self._module = module

    def getChild(self, path: bytes, request: SynapseRequest) -> Resource:
        del request
        if not path:
            return self
        return NodeReputationResource(
            self._module_api, self._module, path.decode("utf-8")
        )


class BlackoutRootResource(Resource):
    isLeaf = False

    def __init__(self, module_api: Any, module: "BlackoutRuntimeModule"):
        super().__init__()
        self.putChild(
            b"presence", BlackoutPresenceResource(module_api, module._presence)
        )
        governance_resource = Resource()
        governance_resource.putChild(
            b"decisions", GovernanceDecisionsResource(module_api, module)
        )
        self.putChild(b"governance", governance_resource)
        self.putChild(b"reputation", ReputationRootResource(module_api, module))


class BlackoutRuntimeModule:
    """Synapse module integration for blackout runtime semantics."""

    def __init__(self, config: JsonDict, module_api: Any):
        self._config = config
        self._module_api = module_api
        self._store = module_api._store
        self._semantics = BlackoutServerSemantics()
        self._local_server_name = str(
            config.get(
                "local_server_name",
                getattr(getattr(module_api, "_hs", None), "hostname", ""),
            )
        )
        self._presence = BlackoutPresenceService()
        self._proposal_rate_window_s = int(config.get("proposal_rate_window_s", 3600))
        self._proposal_rate_limit = int(config.get("proposal_rate_limit", 5))
        self._attestation_cooldown_s = int(config.get("attestation_cooldown_s", 600))
        self._stego_ttl_hours = int(config.get("stego_ttl_hours", 48))
        self._stego_purge_batch_size = int(config.get("stego_purge_batch_size", 100))
        self._plugin_signature_secret = str(
            config.get("plugin_signature_secret", "blackout-plugin-dev")
        )
        self._supported_extension_contract_versions: Set[int] = {
            int(version)
            for version in config.get(
                "supported_extension_contract_versions",
                [1],
            )
            if isinstance(version, int)
        }
        if not self._supported_extension_contract_versions:
            self._supported_extension_contract_versions = {1}
        self._supported_runtime_capabilities: Set[str] = {
            str(capability)
            for capability in config.get(
                "supported_runtime_capabilities",
                ["stego:processor", "governance:hooks", "telemetry:emit"],
            )
            if isinstance(capability, str) and capability
        }
        self._runtime_extensions_enabled = bool(
            config.get("blackout_enable_runtime_extensions", False)
        )
        self._signal_ttl_hours = int(config.get("blackout_signal_ttl_hours", 48))
        self._signal_ttl_hours = max(24, min(72, self._signal_ttl_hours))
        self._signal_purge_interval_minutes = int(
            config.get("blackout_purge_interval_minutes", 15)
        )
        self._signal_purge_batch_size = int(config.get("signal_purge_batch_size", 200))
        self._attestation_secret = str(config.get("attestation_secret", "blackout-dev"))
        self._relay_fallback_limit_per_minute = int(
            config.get("relay_fallback_limit_per_minute", 30)
        )
        self._proposal_times: Dict[str, Deque[int]] = defaultdict(deque)
        self._attestation_times: Dict[Tuple[str, str], int] = {}
        self._relay_fallback_times: Dict[str, Deque[int]] = defaultdict(deque)
        self._boost_update_times: Dict[str, Deque[int]] = defaultdict(deque)
        self._boost_update_limit_per_minute = int(
            config.get("boost_update_limit_per_minute", 20)
        )
        self._deliberation_windows: Dict[Tuple[str, str], Tuple[int, int]] = {}
        self._deliberation_voters: Set[Tuple[str, str, str]] = set()
        self._backfilled_rooms: Set[str] = set()
        self._backfilled_nodes: Set[str] = set()
        self._dead_drop_ttl_hours = int(config.get("dead_drop_ttl_hours", 24))
        self._dead_drop_purge_batch_size = int(
            config.get("dead_drop_purge_batch_size", 100)
        )
        self._dead_drop_invite_rate_limit_per_minute = int(
            config.get("dead_drop_invite_rate_limit_per_minute", 20)
        )
        self._dead_drop_join_rate_limit_per_minute = int(
            config.get("dead_drop_join_rate_limit_per_minute", 30)
        )
        self._dead_drop_membership_times: Dict[
            Tuple[str, str], Deque[int]
        ] = defaultdict(deque)
        self._anomaly_events: List[JsonDict] = []
        self._signal_metrics: Dict[str, int] = defaultdict(int)

        db_path = Path(
            str(config.get("persistence_path", "/tmp/blackout_runtime.sqlite3"))
        )
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS blackout_governance_decisions (token INTEGER PRIMARY KEY, room_id TEXT NOT NULL, event_id TEXT NOT NULL UNIQUE, proposal_id TEXT NOT NULL, decision TEXT NOT NULL, finalized_at INTEGER, sender TEXT NOT NULL)"
        )
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS blackout_governance_proposals (room_id TEXT NOT NULL, proposal_id TEXT NOT NULL, opens_at INTEGER NOT NULL, closes_at INTEGER NOT NULL, PRIMARY KEY (room_id, proposal_id))"
        )
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS blackout_reputation_updates (event_id TEXT PRIMARY KEY, node_id TEXT NOT NULL, delta REAL NOT NULL, reason TEXT NOT NULL, rating REAL, attestation_status TEXT, governance_standing TEXT)"
        )
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS blackout_dead_drop_retention (event_id TEXT PRIMARY KEY, room_id TEXT NOT NULL, expires_at_ms INTEGER NOT NULL, purged_at_ms INTEGER)"
        )
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS blackout_stego_retention (event_id TEXT PRIMARY KEY, room_id TEXT NOT NULL, expires_at_ms INTEGER NOT NULL, purged_at_ms INTEGER)"
        )
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS blackout_signal_retention (event_id TEXT PRIMARY KEY, room_id TEXT NOT NULL, expires_at_ms INTEGER NOT NULL, purged_at_ms INTEGER)"
        )
        self._conn.commit()

        self._decisions = GovernanceDecisionStore(self._conn)
        self._proposals = GovernanceProposalStore(self._conn)
        self._reputation = ReputationStore(self._conn)

        self._module_api.register_third_party_rules_callbacks(
            on_create_room=self.on_create_room,
            check_event_allowed=self.check_event_allowed,
            on_new_event=self.on_new_event,
        )
        self._module_api.register_web_resource(
            "/_synapse/client/blackout", BlackoutRootResource(self._module_api, self)
        )

    async def backfill_room(self, room_id: str) -> None:
        if room_id in self._backfilled_rooms:
            return
        limit = int(self._config.get("backfill_room_limit", 1000))
        end_token = self._store.get_room_max_token()
        events, _ = await self._store.get_recent_events_for_room(
            room_id, limit, end_token
        )
        for event in events:
            self._proposals.ingest_event(event)
            self._decisions.ingest_event(event)
            self._reputation.ingest_event(event)
        self._backfilled_rooms.add(room_id)

    async def backfill_node(self, node_id: str) -> None:
        if node_id in self._backfilled_nodes:
            return

        like_pattern = f'%"node_id":"{node_id}"%'

        def _txn(txn: Any) -> List[str]:
            txn.execute(
                "SELECT event_id FROM event_json WHERE json LIKE ?",
                (like_pattern,),
            )
            return [row[0] for row in txn]

        event_ids = await self._store.db_pool.runInteraction(
            "blackout_backfill_node", _txn
        )
        if event_ids:
            events = await self._store.get_events_as_list(event_ids)
            for event in events:
                self._reputation.ingest_event(event)
        self._backfilled_nodes.add(node_id)

    async def on_create_room(
        self,
        requester: Any,
        config: MutableMapping[str, object],
        is_requester_admin: bool,
    ) -> None:
        del is_requester_admin
        try:
            self._semantics.on_create_room(
                config,
                local_server_name=self._local_server_name,
            )
        except ValueError as exc:
            raise SynapseError(403, str(exc))

        initial_state = config.get("initial_state")
        if not isinstance(initial_state, list):
            return

        requester_user_id = requester.user.to_string()
        for state_event in initial_state:
            if state_event.get("type") != "m.room.power_levels":
                continue
            content = state_event.get("content")
            if not isinstance(content, dict):
                continue
            users = content.get("users")
            if not isinstance(users, dict):
                users = {}
            users[requester_user_id] = max(int(users.get(requester_user_id, 0)), 100)
            content["users"] = users
            return

    async def check_event_allowed(
        self, event: Any, state_events: StateMap[Any]
    ) -> tuple[bool, Optional[dict]]:
        channel_type = self._extract_channel_type(state_events)

        try:
            self._semantics.check_event_allowed(
                event.type, event.content, channel_type=channel_type
            )
        except ValueError as exc:
            if (
                isinstance(event.type, str)
                and event.type in MIGRATION_BLOCKED_EVENT_TYPES
                and isinstance(channel_type, str)
            ):
                self._signal_metrics[f"migration_blocked.{event.type}"] += 1
                self._anomaly_events.append(
                    {
                        "ts": int(time.time()),
                        "type": "migration_payload_blocked",
                        "event_type": event.type,
                        "channel_type": channel_type,
                    }
                )
            raise SynapseError(403, str(exc), errcode=Codes.FORBIDDEN)

        now = int(time.time())
        sender = getattr(event, "sender", "")
        room_id = getattr(event, "room_id", "")

        if event.type == GOVERNANCE_PROPOSAL_EVENT and isinstance(sender, str):
            q = self._proposal_times[sender]
            while q and q[0] <= now - self._proposal_rate_window_s:
                q.popleft()
            if len(q) >= self._proposal_rate_limit:
                raise SynapseError(429, "Governance proposal rate limit exceeded")
            q.append(now)

        if event.type == GOVERNANCE_VOTE_EVENT:
            proposal_id = (
                event.content.get("proposal_id")
                if isinstance(event.content, Mapping)
                else None
            )
            if (
                isinstance(proposal_id, str)
                and isinstance(sender, str)
                and isinstance(room_id, str)
            ):
                if self._decisions.has_voted(room_id, proposal_id, sender):
                    raise SynapseError(
                        403, "Only one vote per user per proposal is allowed"
                    )
                vote_window = self._proposals.vote_window_for(room_id, proposal_id)
                if vote_window is None:
                    raise SynapseError(
                        403, "Vote rejected: unknown governance proposal_id"
                    )
                opens_at, closes_at = vote_window
                if now < opens_at or now > closes_at:
                    raise SynapseError(
                        403, "Vote rejected: governance proposal is outside voting window"
                    )

        if event.type == GOVERNANCE_ATTESTATION_EVENT and isinstance(
            event.content, Mapping
        ):
            proposal_id = event.content.get("proposal_id")
            if isinstance(proposal_id, str) and isinstance(room_id, str):
                if self._proposals.vote_window_for(room_id, proposal_id) is None:
                    raise SynapseError(
                        403, "Governance attestation rejected: unknown proposal_id"
                    )

        if event.type == DELIBERATION_PROPOSAL_EVENT and isinstance(event.content, Mapping):
            workflow_id = event.content.get("workflow_id")
            opens_at = event.content.get("opens_at")
            closes_at = event.content.get("closes_at")
            if (
                isinstance(workflow_id, str)
                and isinstance(room_id, str)
                and isinstance(opens_at, int)
                and isinstance(closes_at, int)
            ):
                self._deliberation_windows[(room_id, workflow_id)] = (opens_at, closes_at)

        if event.type == DELIBERATION_VOTE_EVENT and isinstance(event.content, Mapping):
            workflow_id = event.content.get("workflow_id")
            if (
                isinstance(workflow_id, str)
                and isinstance(sender, str)
                and isinstance(room_id, str)
            ):
                window = self._deliberation_windows.get((room_id, workflow_id))
                if window is None:
                    raise SynapseError(
                        403, "Deliberation vote rejected: unknown workflow_id"
                    )
                opens_at, closes_at = window
                if now < opens_at or now > closes_at:
                    raise SynapseError(
                        403, "Deliberation vote rejected: workflow is outside voting window"
                    )
                voter_key = (room_id, workflow_id, sender)
                if voter_key in self._deliberation_voters:
                    raise SynapseError(
                        403,
                        "Deliberation vote rejected: only one vote per user per workflow",
                    )
                self._deliberation_voters.add(voter_key)

        if event.type == DELIBERATION_EXECUTION_EVENT and isinstance(
            event.content, Mapping
        ):
            workflow_id = event.content.get("workflow_id")
            if isinstance(workflow_id, str) and isinstance(room_id, str):
                if (room_id, workflow_id) not in self._deliberation_windows:
                    raise SynapseError(
                        403, "Deliberation execution rejected: unknown workflow_id"
                    )

        if event.type == BOOST_STATE_EVENT and isinstance(sender, str):
            q = self._boost_update_times[sender]
            while q and q[0] <= now - 60:
                q.popleft()
            if len(q) >= self._boost_update_limit_per_minute:
                self._anomaly_events.append(
                    {
                        "ts": now,
                        "type": "boost_update_rate_exceeded",
                        "sender": sender,
                        "limit": self._boost_update_limit_per_minute,
                    }
                )
                raise SynapseError(429, "Boost update rate limit exceeded")
            q.append(now)

        if event.type == PAID_ROOM_STATE_EVENT and isinstance(event.content, Mapping):
            if not isinstance(event.content.get("paid_room"), bool):
                raise SynapseError(403, "paid_room must be boolean")

        if event.type in {
            TOWNHALL_SESSION_EVENT,
            TOWNHALL_AGENDA_EVENT,
            TOWNHALL_SUMMARY_EVENT,
        } and isinstance(sender, str):
            self._signal_metrics[f"townhall.{event.type}.accepted"] += 1

        if event.type == REPUTATION_UPDATE_EVENT and isinstance(event.content, Mapping):
            node_id = event.content.get("node_id")
            attestation_status = event.content.get("attestation_status")
            if (
                isinstance(node_id, str)
                and isinstance(attestation_status, str)
                and isinstance(sender, str)
            ):
                key = (sender, node_id)
                last = self._attestation_times.get(key)
                if last is not None and now - last < self._attestation_cooldown_s:
                    raise SynapseError(429, "Attestation update cooldown active")
                self._attestation_times[key] = now

        if event.type == PLUGIN_REGISTER_EVENT_TYPE and isinstance(event.content, Mapping):
            self._validate_plugin_registration(
                sender=sender if isinstance(sender, str) else "",
                content=event.content,
                state_events=state_events,
            )

        if event.type == RUNTIME_EXTENSION_EVENT_TYPE and isinstance(
            event.content, Mapping
        ):
            self._validate_runtime_extension_activation(event.content)

        if (
            channel_type == ANNOUNCEMENT_CHANNEL_TYPE
            and event.type == ANNOUNCEMENT_MESSAGE_EVENT_TYPE
        ):
            if not isinstance(sender, str) or not sender:
                raise SynapseError(403, "Announcement sender identity required")
            sender_power = self._sender_power_level(sender, state_events)
            required_power = self._required_event_power_level(event.type, state_events)
            if sender_power < required_power:
                raise SynapseError(
                    403, "Sender is not permitted to post in announcement room"
                )

            policy = self._announcement_policy(state_events)
            allowed_roles = policy.get("sender_roles")
            sender_role = (
                event.content.get("blackout_sender_role")
                if isinstance(event.content, Mapping)
                else None
            )
            if isinstance(allowed_roles, list):
                if not isinstance(sender_role, str) or sender_role not in allowed_roles:
                    raise SynapseError(
                        403, "Sender role is not allowed for announcement fanout"
                    )

            fanout_mode = policy.get("fanout_mode", "immediate")
            if fanout_mode == "delayed_window":
                fanout = (
                    event.content.get("blackout_fanout")
                    if isinstance(event.content, Mapping)
                    else None
                )
                if not isinstance(fanout, Mapping):
                    raise SynapseError(
                        403, "Delayed fanout policy requires blackout_fanout payload"
                    )
                delay_ms = fanout.get("delay_ms")
                if not isinstance(delay_ms, int):
                    raise SynapseError(403, "Delayed fanout requires integer delay_ms")
                min_ms = policy.get("delayed_fanout_min_ms", 0)
                max_ms = policy.get("delayed_fanout_max_ms", 0)
                if (
                    not isinstance(min_ms, int)
                    or not isinstance(max_ms, int)
                    or delay_ms < min_ms
                    or delay_ms > max_ms
                ):
                    raise SynapseError(
                        403, "Delayed fanout delay_ms is outside policy bounds"
                    )

        if (
            channel_type == DEAD_DROP_CHANNEL_TYPE
            and event.type == ROOM_MEMBER_EVENT_TYPE
            and isinstance(event.content, Mapping)
        ):
            membership = event.content.get("membership")
            if membership in {"invite", "join"} and isinstance(sender, str) and sender:
                self._enforce_dead_drop_membership_quota(
                    sender=sender, membership=membership, now_s=now
                )

        if event.type == BLACKOUT_SIGNAL_EVENT_TYPE and isinstance(event.content, Mapping):
            stego_meta = event.content.get("blackout_stego")
            message_metadata = event.content.get("message_metadata")
            content_class = None
            if isinstance(message_metadata, Mapping):
                raw_class = message_metadata.get("content_class")
                if isinstance(raw_class, str):
                    content_class = raw_class
                    self._signal_metrics[f"content_class.{content_class}.accepted"] += 1

            if content_class == "webrtc-session":
                turn_usage = event.content.get("turn_usage")
                if isinstance(turn_usage, Mapping):
                    relay_fallback = bool(turn_usage.get("relay_fallback"))
                    if relay_fallback:
                        self._signal_metrics["relay_fallback_total"] += 1
                        if isinstance(sender, str) and sender:
                            self._enforce_relay_fallback_rate(sender=sender, now_s=now)
                elif turn_usage is not None:
                    raise SynapseError(403, "turn_usage must be an object when present")

            if stego_meta is not None:
                if not isinstance(stego_meta, Mapping):
                    raise SynapseError(403, "blackout_stego metadata must be an object")
                self._validate_stego_metadata(stego_meta)
                self._enforce_stego_policy_and_entitlement(
                    event_content=event.content,
                    state_events=state_events,
                    sender=sender if isinstance(sender, str) else "",
                )

        if event.type == DELEGATION_GRANT_EVENT:
            sender_power = self._sender_power_level(sender, state_events)
            if sender_power < 50:
                raise SynapseError(403, "Delegation grants require moderator power")

        if event.type == ATTESTATION_EVENT and isinstance(event.content, Mapping):
            self._validate_attestation_proof(event.content)
            self._enforce_attestation_scope(
                sender=sender if isinstance(sender, str) else "",
                state_events=state_events,
            )

        return True, None

    async def on_new_event(self, event: Any, state_events: StateMap[Any]) -> None:
        channel_type = self._extract_channel_type(state_events)
        if (
            channel_type == DEAD_DROP_CHANNEL_TYPE
            and event.type == DEAD_DROP_MESSAGE_EVENT_TYPE
        ):
            event_ts_ms = getattr(event, "origin_server_ts", None)
            if not isinstance(event_ts_ms, int):
                event_ts_ms = int(time.time() * 1000)
            expires_at_ms = event_ts_ms + (self._dead_drop_ttl_hours * 3_600_000)
            self._conn.execute(
                "INSERT OR IGNORE INTO blackout_dead_drop_retention (event_id, room_id, expires_at_ms, purged_at_ms) VALUES (?, ?, ?, NULL)",
                (event.event_id, event.room_id, expires_at_ms),
            )
            self._conn.commit()

        if event.type == BLACKOUT_SIGNAL_EVENT_TYPE and isinstance(event.content, Mapping):
            stego_meta = event.content.get("blackout_stego")
            if isinstance(stego_meta, Mapping):
                ttl_hours = self._stego_ttl_hours
                stego_ttl = stego_meta.get("ttl_hours")
                if isinstance(stego_ttl, int) and 1 <= stego_ttl <= 72:
                    ttl_hours = stego_ttl
                event_ts_ms = getattr(event, "origin_server_ts", None)
                if not isinstance(event_ts_ms, int):
                    event_ts_ms = int(time.time() * 1000)
                expires_at_ms = event_ts_ms + (ttl_hours * 3_600_000)
                self._conn.execute(
                    "INSERT OR IGNORE INTO blackout_stego_retention (event_id, room_id, expires_at_ms, purged_at_ms) VALUES (?, ?, ?, NULL)",
                    (event.event_id, event.room_id, expires_at_ms),
                )
                self._conn.commit()

            event_ts_ms = getattr(event, "origin_server_ts", None)
            if not isinstance(event_ts_ms, int):
                event_ts_ms = int(time.time() * 1000)
            ttl_hours = self._signal_ttl_hours
            ttl_override = event.content.get("org.matrix.self_destruct_after")
            if not isinstance(ttl_override, int):
                ttl_override = event.content.get("self_destruct_after")
            if isinstance(ttl_override, int) and ttl_override > 0:
                ttl_hours = max(1, min(72, int(ttl_override // 3600)))
            expires_at_ms = event_ts_ms + (ttl_hours * 3_600_000)
            self._conn.execute(
                "INSERT OR IGNORE INTO blackout_signal_retention (event_id, room_id, expires_at_ms, purged_at_ms) VALUES (?, ?, ?, NULL)",
                (event.event_id, event.room_id, expires_at_ms),
            )
            self._conn.commit()

        self._proposals.ingest_event(event)
        self._decisions.ingest_event(event)
        self._reputation.ingest_event(event)

    def run_dead_drop_purge(self, *, now_ms: Optional[int] = None) -> List[JsonDict]:
        if now_ms is None:
            now_ms = int(time.time() * 1000)

        rows = self._conn.execute(
            "SELECT event_id, room_id, expires_at_ms FROM blackout_dead_drop_retention WHERE purged_at_ms IS NULL AND expires_at_ms <= ? ORDER BY expires_at_ms ASC LIMIT ?",
            (now_ms, self._dead_drop_purge_batch_size),
        ).fetchall()

        purged: List[JsonDict] = []
        for event_id, room_id, expires_at_ms in rows:
            self._conn.execute(
                "UPDATE blackout_dead_drop_retention SET purged_at_ms = ? WHERE event_id = ?",
                (now_ms, event_id),
            )
            purged.append(
                {
                    "event_id": event_id,
                    "room_id": room_id,
                    "expires_at_ms": expires_at_ms,
                    "purged_at_ms": now_ms,
                    "tombstone_event_type": "m.room.tombstone",
                }
            )

        if rows:
            self._conn.commit()
        return purged

    def run_stego_purge(self, *, now_ms: Optional[int] = None) -> List[JsonDict]:
        if now_ms is None:
            now_ms = int(time.time() * 1000)

        rows = self._conn.execute(
            "SELECT event_id, room_id, expires_at_ms FROM blackout_stego_retention WHERE purged_at_ms IS NULL AND expires_at_ms <= ? ORDER BY expires_at_ms ASC LIMIT ?",
            (now_ms, self._stego_purge_batch_size),
        ).fetchall()

        purged: List[JsonDict] = []
        for event_id, room_id, expires_at_ms in rows:
            self._conn.execute(
                "UPDATE blackout_stego_retention SET purged_at_ms = ? WHERE event_id = ?",
                (now_ms, event_id),
            )
            purged.append(
                {
                    "event_id": event_id,
                    "room_id": room_id,
                    "expires_at_ms": expires_at_ms,
                    "purged_at_ms": now_ms,
                    "tombstone_event_type": "m.blackout.stego.purge",
                }
            )
        if rows:
            self._conn.commit()
        return purged

    def run_signal_purge(self, *, now_ms: Optional[int] = None) -> List[JsonDict]:
        if now_ms is None:
            now_ms = int(time.time() * 1000)

        rows = self._conn.execute(
            "SELECT event_id, room_id, expires_at_ms FROM blackout_signal_retention WHERE purged_at_ms IS NULL AND expires_at_ms <= ? ORDER BY expires_at_ms ASC LIMIT ?",
            (now_ms, self._signal_purge_batch_size),
        ).fetchall()
        purged: List[JsonDict] = []
        for event_id, room_id, expires_at_ms in rows:
            self._conn.execute(
                "UPDATE blackout_signal_retention SET purged_at_ms = ? WHERE event_id = ?",
                (now_ms, event_id),
            )
            purged.append(
                {
                    "event_id": event_id,
                    "room_id": room_id,
                    "expires_at_ms": expires_at_ms,
                    "purged_at_ms": now_ms,
                    "tombstone_event_type": "m.blackout.signal.purge",
                }
            )
        if rows:
            self._conn.commit()
        return purged

    def get_dead_drop_retention_record(self, event_id: str) -> Optional[JsonDict]:
        row = self._conn.execute(
            "SELECT event_id, room_id, expires_at_ms, purged_at_ms FROM blackout_dead_drop_retention WHERE event_id = ?",
            (event_id,),
        ).fetchone()
        if row is None:
            return None
        return {
            "event_id": row[0],
            "room_id": row[1],
            "expires_at_ms": row[2],
            "purged_at_ms": row[3],
        }

    def get_stego_retention_record(self, event_id: str) -> Optional[JsonDict]:
        row = self._conn.execute(
            "SELECT event_id, room_id, expires_at_ms, purged_at_ms FROM blackout_stego_retention WHERE event_id = ?",
            (event_id,),
        ).fetchone()
        if row is None:
            return None
        return {
            "event_id": row[0],
            "room_id": row[1],
            "expires_at_ms": row[2],
            "purged_at_ms": row[3],
        }

    def get_signal_retention_record(self, event_id: str) -> Optional[JsonDict]:
        row = self._conn.execute(
            "SELECT event_id, room_id, expires_at_ms, purged_at_ms FROM blackout_signal_retention WHERE event_id = ?",
            (event_id,),
        ).fetchone()
        if row is None:
            return None
        return {
            "event_id": row[0],
            "room_id": row[1],
            "expires_at_ms": row[2],
            "purged_at_ms": row[3],
        }

    def is_signal_event_retrievable(self, event_id: str) -> bool:
        record = self.get_signal_retention_record(event_id)
        if record is None:
            return True
        return record["purged_at_ms"] is None

    def _enforce_dead_drop_membership_quota(
        self, *, sender: str, membership: str, now_s: int
    ) -> None:
        key = (sender, membership)
        q = self._dead_drop_membership_times[key]
        while q and q[0] <= now_s - 60:
            q.popleft()

        limit = (
            self._dead_drop_invite_rate_limit_per_minute
            if membership == "invite"
            else self._dead_drop_join_rate_limit_per_minute
        )
        if len(q) >= limit:
            self._anomaly_events.append(
                {
                    "ts": now_s,
                    "type": "dead_drop_membership_rate_exceeded",
                    "sender": sender,
                    "membership": membership,
                    "limit": limit,
                }
            )
            raise SynapseError(429, f"Dead-drop {membership} rate limit exceeded")

        q.append(now_s)

    def drain_anomaly_events(self) -> List[JsonDict]:
        drained = list(self._anomaly_events)
        self._anomaly_events.clear()
        return drained

    def snapshot_signal_metrics(self) -> JsonDict:
        return dict(self._signal_metrics)

    def _enforce_relay_fallback_rate(self, *, sender: str, now_s: int) -> None:
        q = self._relay_fallback_times[sender]
        while q and q[0] <= now_s - 60:
            q.popleft()
        if len(q) >= self._relay_fallback_limit_per_minute:
            self._anomaly_events.append(
                {
                    "ts": now_s,
                    "type": "relay_fallback_rate_exceeded",
                    "sender": sender,
                    "limit": self._relay_fallback_limit_per_minute,
                }
            )
            raise SynapseError(429, "Relay fallback rate limit exceeded")
        q.append(now_s)

    @staticmethod
    def _validate_stego_metadata(stego_meta: Mapping[str, object]) -> None:
        required = ("carrier", "payload_hash", "policy_id")
        missing = [key for key in required if key not in stego_meta]
        if missing:
            raise SynapseError(403, f"Stego metadata missing required fields: {missing}")
        carrier = stego_meta.get("carrier")
        if not isinstance(carrier, str) or carrier not in {"image", "audio", "video"}:
            raise SynapseError(403, "Stego metadata carrier must be image|audio|video")
        payload_hash = stego_meta.get("payload_hash")
        if not isinstance(payload_hash, str) or len(payload_hash) < 16:
            raise SynapseError(403, "Stego metadata payload_hash must be a stable hash")
        ttl_hours = stego_meta.get("ttl_hours")
        if ttl_hours is not None and (
            not isinstance(ttl_hours, int) or ttl_hours < 1 or ttl_hours > 72
        ):
            raise SynapseError(403, "Stego metadata ttl_hours must be 1..72")

    def _enforce_stego_policy_and_entitlement(
        self,
        *,
        event_content: Mapping[str, object],
        state_events: StateMap[Any],
        sender: str,
    ) -> None:
        policy_event = state_events.get((STEGO_POLICY_EVENT, ""))
        policy_content = getattr(policy_event, "content", None)
        if isinstance(policy_content, Mapping):
            allow_stego = policy_content.get("allow_stego")
            if allow_stego is False:
                raise SynapseError(403, "Stego transport disabled by room policy")

            policy_ttl_hours = policy_content.get("max_ttl_hours")
            stego_meta = event_content.get("blackout_stego")
            if (
                isinstance(stego_meta, Mapping)
                and isinstance(policy_ttl_hours, int)
                and isinstance(stego_meta.get("ttl_hours"), int)
                and int(stego_meta.get("ttl_hours")) > policy_ttl_hours
            ):
                raise SynapseError(
                    403, "Stego metadata ttl_hours exceeds policy max_ttl_hours"
                )

        entitlements_event = state_events.get((STEGO_ENTITLEMENTS_EVENT_TYPE, ""))
        entitlements_content = getattr(entitlements_event, "content", None)
        if not isinstance(entitlements_content, Mapping):
            raise SynapseError(403, "Stego entitlement required for sender")
        sender_entitlements = entitlements_content.get(sender)
        if (
            not isinstance(sender_entitlements, Sequence)
            or isinstance(sender_entitlements, (str, bytes))
            or "stego:send" not in sender_entitlements
        ):
            raise SynapseError(403, "Stego entitlement required for sender")

    def _validate_attestation_proof(self, content: Mapping[str, object]) -> None:
        node_id = content.get("node_id")
        subject = content.get("subject_user_id")
        proof = content.get("proof")
        if (
            not isinstance(node_id, str)
            or not isinstance(subject, str)
            or not isinstance(proof, str)
        ):
            raise SynapseError(403, "Attestation proof fields are malformed")
        expected = hashlib.sha256(
            f"{node_id}:{subject}:{self._attestation_secret}".encode("utf-8")
        ).hexdigest()
        if proof != expected:
            raise SynapseError(403, "Attestation proof verification failed")

    def _validate_plugin_registration(
        self, *, sender: str, content: Mapping[str, object], state_events: StateMap[Any]
    ) -> None:
        plugin_id = content.get("plugin_id")
        plugin_version = content.get("plugin_version")
        capabilities = content.get("capabilities")
        signing_key_id = content.get("signing_key_id")
        signature = content.get("signature")

        if (
            not isinstance(plugin_id, str)
            or not plugin_id
            or not isinstance(plugin_version, str)
            or not plugin_version
            or not isinstance(signing_key_id, str)
            or not signing_key_id
            or not isinstance(signature, str)
            or not signature
            or not isinstance(capabilities, Sequence)
            or isinstance(capabilities, (str, bytes))
            or not capabilities
            or any(not isinstance(cap, str) or not cap for cap in capabilities)
        ):
            self._anomaly_events.append(
                {
                    "ts": int(time.time()),
                    "type": "plugin_registration_rejected",
                    "sender": sender,
                    "reason": "malformed_registration",
                }
            )
            raise SynapseError(403, "Plugin registration payload is malformed")

        policy_event = state_events.get((PLUGIN_POLICY_EVENT_TYPE, ""))
        policy_content = getattr(policy_event, "content", None)
        if not isinstance(policy_content, Mapping):
            self._anomaly_events.append(
                {
                    "ts": int(time.time()),
                    "type": "plugin_registration_rejected",
                    "sender": sender,
                    "plugin_id": plugin_id,
                    "reason": "missing_policy",
                }
            )
            raise SynapseError(403, "Plugin registration policy is required")

        allowlisted_plugins = self._coerce_string_list(
            policy_content.get("allowlisted_plugins")
        )
        if allowlisted_plugins is None or plugin_id not in allowlisted_plugins:
            self._anomaly_events.append(
                {
                    "ts": int(time.time()),
                    "type": "plugin_registration_rejected",
                    "sender": sender,
                    "plugin_id": plugin_id,
                    "reason": "plugin_not_allowlisted",
                }
            )
            raise SynapseError(403, "Plugin is not allowlisted for registration")

        revoked_signing_keys = self._coerce_string_list(
            policy_content.get("revoked_signing_key_ids")
        )
        if revoked_signing_keys is not None and signing_key_id in revoked_signing_keys:
            self._anomaly_events.append(
                {
                    "ts": int(time.time()),
                    "type": "plugin_registration_rejected",
                    "sender": sender,
                    "plugin_id": plugin_id,
                    "signing_key_id": signing_key_id,
                    "reason": "signing_key_revoked",
                }
            )
            raise SynapseError(403, "Plugin signing key has been revoked")

        trusted_capabilities = self._coerce_string_list(
            policy_content.get("trusted_capabilities")
        )
        if trusted_capabilities is not None and any(
            capability not in trusted_capabilities for capability in capabilities
        ):
            self._anomaly_events.append(
                {
                    "ts": int(time.time()),
                    "type": "plugin_registration_rejected",
                    "sender": sender,
                    "plugin_id": plugin_id,
                    "reason": "capability_not_trusted",
                }
            )
            raise SynapseError(403, "Plugin requests a capability outside trust policy")

        canonical_capabilities = sorted(capabilities)
        expected_signature = hmac.new(
            self._plugin_signature_secret.encode("utf-8"),
            f"{plugin_id}:{plugin_version}:{signing_key_id}:{','.join(canonical_capabilities)}".encode(
                "utf-8"
            ),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(signature, expected_signature):
            self._anomaly_events.append(
                {
                    "ts": int(time.time()),
                    "type": "plugin_registration_rejected",
                    "sender": sender,
                    "plugin_id": plugin_id,
                    "reason": "signature_verification_failed",
                }
            )
            raise SynapseError(403, "Plugin signature verification failed")

    def _validate_runtime_extension_activation(
        self, content: Mapping[str, object]
    ) -> None:
        if not self._runtime_extensions_enabled:
            raise SynapseError(403, "Runtime extensions are disabled by configuration")

        extension_id = content.get("extension_id")
        contract_version = content.get("contract_version")
        requested_capabilities = content.get("requested_capabilities")

        if not isinstance(extension_id, str) or not extension_id:
            raise SynapseError(403, "Runtime extension requires extension_id")
        if not isinstance(contract_version, int) or isinstance(contract_version, bool):
            raise SynapseError(403, "Runtime extension requires integer contract_version")
        if contract_version not in self._supported_extension_contract_versions:
            raise SynapseError(
                403,
                "Runtime extension contract_version is incompatible with this server",
            )
        if (
            not isinstance(requested_capabilities, Sequence)
            or isinstance(requested_capabilities, (str, bytes))
            or not requested_capabilities
            or any(
                not isinstance(capability, str) or not capability
                for capability in requested_capabilities
            )
        ):
            raise SynapseError(
                403,
                "Runtime extension requested_capabilities must be a list of strings",
            )
        unsupported = [
            capability
            for capability in requested_capabilities
            if capability not in self._supported_runtime_capabilities
        ]
        if unsupported:
            raise SynapseError(
                403,
                f"Runtime extension requested unsupported capabilities: {unsupported}",
            )

    @staticmethod
    def _coerce_string_list(value: object) -> Optional[List[str]]:
        if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
            return None
        if any(not isinstance(item, str) or not item for item in value):
            return None
        return list(value)

    @staticmethod
    def _enforce_attestation_scope(sender: str, state_events: StateMap[Any]) -> None:
        delegation_event = state_events.get((DELEGATION_GRANT_EVENT, sender))
        delegation_content = getattr(delegation_event, "content", None)
        if not isinstance(delegation_content, Mapping):
            raise SynapseError(403, "Delegation scope required for attestation writes")
        scopes = delegation_content.get("scopes")
        if (
            not isinstance(scopes, Sequence)
            or isinstance(scopes, (str, bytes))
            or "attestation:write" not in scopes
        ):
            raise SynapseError(403, "Attestation write scope not delegated")

    @staticmethod
    def _announcement_policy(state_events: StateMap[Any]) -> JsonDict:
        event = state_events.get((ANNOUNCEMENT_POLICY_EVENT, ""))
        content = getattr(event, "content", None)
        if isinstance(content, Mapping):
            return dict(content)
        return {
            "sender_roles": ["announcer", "moderator"],
            "fanout_mode": "immediate",
            "delayed_fanout_min_ms": 5_000,
            "delayed_fanout_max_ms": 30_000,
        }

    @staticmethod
    def _sender_power_level(sender: str, state_events: StateMap[Any]) -> int:
        event = state_events.get(("m.room.power_levels", ""))
        content = getattr(event, "content", None)
        if not isinstance(content, Mapping):
            return 0
        users = content.get("users")
        if isinstance(users, Mapping):
            level = users.get(sender)
            if isinstance(level, int):
                return level
        users_default = content.get("users_default")
        if isinstance(users_default, int):
            return users_default
        return 0

    @staticmethod
    def _required_event_power_level(
        event_type: str, state_events: StateMap[Any]
    ) -> int:
        event = state_events.get(("m.room.power_levels", ""))
        content = getattr(event, "content", None)
        if not isinstance(content, Mapping):
            return 50
        events = content.get("events")
        if isinstance(events, Mapping):
            required = events.get(event_type)
            if isinstance(required, int):
                return required
        events_default = content.get("events_default")
        if isinstance(events_default, int):
            return events_default
        return 50

    @staticmethod
    def _extract_channel_type(state_events: StateMap[Any]) -> str | None:
        event = state_events.get((BLACKOUT_CHANNEL_TYPE_EVENT, ""))
        if event is None:
            return None
        content = getattr(event, "content", None)
        if not isinstance(content, Mapping):
            return None
        channel_type = content.get("channel_type")
        return channel_type if isinstance(channel_type, str) else None


def _parse_json_body(request: SynapseRequest) -> JsonDict:
    content = getattr(request, "content", None)
    if content is None:
        raise SynapseError(400, "Request body must be JSON")

    raw = content.read()
    if not raw:
        raise SynapseError(400, "Request body must be JSON")
    try:
        body = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SynapseError(400, "Malformed JSON in request body") from exc
    if not isinstance(body, dict):
        raise SynapseError(400, "Request body must be a JSON object")
    return body


def _parse_query_arg(
    request: SynapseRequest, key: str, *, required: bool
) -> str | None:
    args = request.args or {}
    values = args.get(key.encode("utf-8"), [])
    if not values:
        if required:
            raise SynapseError(400, f"Missing required query parameter: {key}")
        return None
    try:
        return values[0].decode("utf-8")
    except UnicodeDecodeError as exc:
        raise SynapseError(400, f"Query parameter {key} must be utf-8") from exc
