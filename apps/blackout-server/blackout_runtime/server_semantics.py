from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Mapping, MutableMapping, Sequence, cast

BLACKOUT_CHANNEL_TYPE_EVENT = "m.blackout.channel.type"
GOVERNANCE_PROPOSAL_EVENT = "m.blackout.governance.proposal"
GOVERNANCE_VOTE_EVENT = "m.blackout.governance.vote"
GOVERNANCE_ATTESTATION_EVENT = "m.blackout.governance.attestation"
REPUTATION_UPDATE_EVENT = "m.blackout.reputation.update"
PAID_ROOM_STATE_EVENT = "m.blackout.paid_room"
BOOST_STATE_EVENT = "m.blackout.boost.state"
DELIBERATION_PROPOSAL_EVENT = "m.blackout.deliberation.proposal"
DELIBERATION_VOTE_EVENT = "m.blackout.deliberation.vote"
DELIBERATION_EXECUTION_EVENT = "m.blackout.deliberation.execution"
TOWNHALL_SESSION_EVENT = "m.blackout.townhall.session"
TOWNHALL_AGENDA_EVENT = "m.blackout.townhall.agenda"
TOWNHALL_SUMMARY_EVENT = "m.blackout.townhall.summary"
ANNOUNCEMENT_POLICY_EVENT = "m.blackout.announcement.policy"
STEGO_POLICY_EVENT = "m.blackout.stego.policy"
STEGO_ENTITLEMENTS_EVENT = "m.blackout.entitlements"
DELEGATION_GRANT_EVENT = "m.blackout.delegation.grant"
ATTESTATION_EVENT = "m.blackout.attestation"

BLACKOUT_PRESENCE_ROUTE = "/_synapse/client/blackout/presence"
MIGRATION_BLOCKED_EVENT_TYPES = {"m.room.message", "m.room.encrypted"}
SIGNAL_MIGRATION_CHANNEL_TYPES = {"governance", "dispute"}

_ALLOWED_PRESENCE = {
    "delivering",
    "available_for_claims",
    "off_duty",
    "in_governance_session",
}

PRESET_TO_CHANNEL_TYPE = {
    "blackout_cell_space": "blackout_cell_space",
    "blackout_dead_drop_room": "blackout_dead_drop_room",
    "blackout_announcement_room": "blackout_announcement_room",
}

FEDERATION_TRUST_TIER_ACLS: Dict[str, Mapping[str, Sequence[str]]] = {
    "local": {"allow": ["*.local"], "deny": []},
    "partner": {"allow": ["*.local", "partner.example"], "deny": []},
    "restricted": {"allow": ["*.local"], "deny": ["*"]},
}


@dataclass(frozen=True)
class RoomTemplate:
    join_rule: str
    power_levels: Mapping[str, object]
    allowed_event_types: Sequence[str]
    extra_state_events: Mapping[str, Mapping[str, object]] = field(default_factory=dict)


ROOM_TEMPLATES: Dict[str, RoomTemplate] = {
    "voice": RoomTemplate(
        join_rule="invite",
        power_levels={"events_default": 50, "state_default": 100},
        allowed_event_types=(
            "m.room.message",
            "m.call.invite",
            BLACKOUT_CHANNEL_TYPE_EVENT,
        ),
    ),
    "forum": RoomTemplate(
        join_rule="public",
        power_levels={"events_default": 0, "state_default": 50},
        allowed_event_types=(
            "m.room.message",
            "m.room.topic",
            BLACKOUT_CHANNEL_TYPE_EVENT,
        ),
    ),
    "governance": RoomTemplate(
        join_rule="invite",
        power_levels={"events_default": 0, "state_default": 100},
        allowed_event_types=(
            "m.room.message",
            "m.blackout.signal",
            GOVERNANCE_PROPOSAL_EVENT,
            GOVERNANCE_VOTE_EVENT,
            GOVERNANCE_ATTESTATION_EVENT,
            DELIBERATION_PROPOSAL_EVENT,
            DELIBERATION_VOTE_EVENT,
            DELIBERATION_EXECUTION_EVENT,
            PAID_ROOM_STATE_EVENT,
            BOOST_STATE_EVENT,
            TOWNHALL_SESSION_EVENT,
            TOWNHALL_AGENDA_EVENT,
            TOWNHALL_SUMMARY_EVENT,
            DELEGATION_GRANT_EVENT,
            ATTESTATION_EVENT,
            REPUTATION_UPDATE_EVENT,
            BLACKOUT_CHANNEL_TYPE_EVENT,
            STEGO_POLICY_EVENT,
            STEGO_ENTITLEMENTS_EVENT,
        ),
    ),
    "dispute": RoomTemplate(
        join_rule="invite",
        power_levels={"events_default": 0, "state_default": 100},
        allowed_event_types=(
            "m.room.message",
            "m.blackout.signal",
            GOVERNANCE_PROPOSAL_EVENT,
            GOVERNANCE_VOTE_EVENT,
            GOVERNANCE_ATTESTATION_EVENT,
            DELIBERATION_PROPOSAL_EVENT,
            DELIBERATION_VOTE_EVENT,
            DELIBERATION_EXECUTION_EVENT,
            PAID_ROOM_STATE_EVENT,
            BOOST_STATE_EVENT,
            TOWNHALL_SESSION_EVENT,
            TOWNHALL_AGENDA_EVENT,
            TOWNHALL_SUMMARY_EVENT,
            BLACKOUT_CHANNEL_TYPE_EVENT,
        ),
    ),
    "blackout_cell_space": RoomTemplate(
        join_rule="invite",
        power_levels={"events_default": 0, "state_default": 100},
        allowed_event_types=(
            "m.room.topic",
            "m.space.child",
            "m.space.parent",
            BLACKOUT_CHANNEL_TYPE_EVENT,
        ),
        extra_state_events={
            "m.room.guest_access": {"guest_access": "forbidden"},
            "m.room.history_visibility": {"history_visibility": "joined"},
        },
    ),
    "blackout_dead_drop_room": RoomTemplate(
        join_rule="invite",
        power_levels={"events_default": 0, "state_default": 100},
        allowed_event_types=(
            "m.room.message",
            "m.room.member",
            BLACKOUT_CHANNEL_TYPE_EVENT,
        ),
        extra_state_events={
            "m.room.history_visibility": {"history_visibility": "joined"},
            "m.room.guest_access": {"guest_access": "forbidden"},
            "m.room.retention": {"max_lifetime": 86_400_000},
        },
    ),
    "blackout_announcement_room": RoomTemplate(
        join_rule="invite",
        power_levels={
            "events_default": 50,
            "state_default": 100,
            "events": {"m.room.message": 50},
        },
        allowed_event_types=(
            "m.room.message",
            "m.room.topic",
            BLACKOUT_CHANNEL_TYPE_EVENT,
            ANNOUNCEMENT_POLICY_EVENT,
        ),
        extra_state_events={
            "m.room.history_visibility": {"history_visibility": "joined"},
            "m.room.guest_access": {"guest_access": "forbidden"},
            ANNOUNCEMENT_POLICY_EVENT: {
                "sender_roles": ["announcer", "moderator"],
                "fanout_mode": "immediate",
                "delayed_fanout_min_ms": 5000,
                "delayed_fanout_max_ms": 30000,
                "rollback_procedure_ref": "docs/ops/announcement_fanout_rollback.md",
            },
        },
    ),
}


class BlackoutServerSemantics:
    """Pure-python helper for module callback logic and schema validation."""

    def on_create_room(
        self,
        config: MutableMapping[str, object],
        *,
        local_server_name: str | None = None,
    ) -> None:
        creation_content = config.get("creation_content", {})
        if not isinstance(creation_content, Mapping):
            raise ValueError("creation_content must be an object")

        channel_type = creation_content.get("m.blackout.channel.type")
        if channel_type is None:
            preset = config.get("preset")
            if isinstance(preset, str):
                channel_type = PRESET_TO_CHANNEL_TYPE.get(preset)
            if channel_type is None:
                return

        template = ROOM_TEMPLATES.get(str(channel_type))
        if template is None:
            raise ValueError(f"Unsupported blackout channel type: {channel_type}")

        if "creation_content" not in config or not isinstance(
            config["creation_content"], MutableMapping
        ):
            config["creation_content"] = dict(creation_content)
        normalized_creation_content = cast(
            MutableMapping[str, object], config["creation_content"]
        )
        normalized_creation_content["m.blackout.channel.type"] = channel_type

        trust_tier = normalized_creation_content.get(
            "blackout.federation.trust_tier", "local"
        )
        if (
            not isinstance(trust_tier, str)
            or trust_tier not in FEDERATION_TRUST_TIER_ACLS
        ):
            raise ValueError("Unsupported federation trust tier")

        initial_state = config.setdefault("initial_state", [])
        if not isinstance(initial_state, list):
            raise ValueError("initial_state must be a list")

        self._upsert_initial_state(
            initial_state,
            event_type="m.room.join_rules",
            content={"join_rule": template.join_rule},
        )
        self._upsert_initial_state(
            initial_state,
            event_type="m.room.power_levels",
            content=dict(template.power_levels),
            merge_content=True,
        )
        self._upsert_initial_state(
            initial_state,
            event_type=BLACKOUT_CHANNEL_TYPE_EVENT,
            content={"channel_type": channel_type},
        )
        allow = list(FEDERATION_TRUST_TIER_ACLS[trust_tier]["allow"])
        if local_server_name:
            allow.append(local_server_name)

        self._upsert_initial_state(
            initial_state,
            event_type="m.room.server_acl",
            content={
                "allow": allow,
                "deny": list(FEDERATION_TRUST_TIER_ACLS[trust_tier]["deny"]),
                "allow_ip_literals": False,
            },
        )

        for event_type, content in template.extra_state_events.items():
            self._upsert_initial_state(
                initial_state,
                event_type=event_type,
                content=content,
            )

    def check_event_allowed(
        self,
        event_type: str,
        content: Mapping[str, object],
        *,
        channel_type: str | None = None,
    ) -> bool:
        if (
            channel_type in SIGNAL_MIGRATION_CHANNEL_TYPES
            and event_type in MIGRATION_BLOCKED_EVENT_TYPES
        ):
            raise ValueError(
                f"Event type {event_type} is blocked in {channel_type} rooms during migration; use m.blackout.signal"
            )

        if event_type == BLACKOUT_CHANNEL_TYPE_EVENT:
            self._validate_channel_type(content)
            return True

        if event_type == GOVERNANCE_PROPOSAL_EVENT:
            self._validate_governance_proposal(content)
            return True

        if event_type == GOVERNANCE_VOTE_EVENT:
            self._validate_governance_vote(content)
            return True

        if event_type == GOVERNANCE_ATTESTATION_EVENT:
            self._validate_governance_attestation(content)
            return True

        if event_type == REPUTATION_UPDATE_EVENT:
            self._validate_reputation_update(content)
            return True

        if event_type == PAID_ROOM_STATE_EVENT:
            self._validate_paid_room_state(content)
            return True

        if event_type == BOOST_STATE_EVENT:
            self._validate_boost_state(content)
            return True

        if event_type == DELIBERATION_PROPOSAL_EVENT:
            self._validate_deliberation_proposal(content)
            return True

        if event_type == DELIBERATION_VOTE_EVENT:
            self._validate_deliberation_vote(content)
            return True

        if event_type == DELIBERATION_EXECUTION_EVENT:
            self._validate_deliberation_execution(content)
            return True

        if event_type == TOWNHALL_SESSION_EVENT:
            self._validate_townhall_session(content)
            return True

        if event_type == TOWNHALL_AGENDA_EVENT:
            self._validate_townhall_agenda(content)
            return True

        if event_type == TOWNHALL_SUMMARY_EVENT:
            self._validate_townhall_summary(content)
            return True

        if event_type == ANNOUNCEMENT_POLICY_EVENT:
            self._validate_announcement_policy(content)
            return True

        if event_type == STEGO_POLICY_EVENT:
            self._validate_stego_policy(content)
            return True

        if event_type == STEGO_ENTITLEMENTS_EVENT:
            self._validate_stego_entitlements(content)
            return True

        if event_type == DELEGATION_GRANT_EVENT:
            self._validate_delegation_grant(content)
            return True

        if event_type == ATTESTATION_EVENT:
            self._validate_attestation(content)
            return True

        if channel_type and channel_type in ROOM_TEMPLATES:
            if event_type not in ROOM_TEMPLATES[channel_type].allowed_event_types:
                raise ValueError(
                    f"Event type {event_type} is not allowed in {channel_type} rooms"
                )

        return True

    @staticmethod
    def _upsert_initial_state(
        initial_state: List[MutableMapping[str, object]],
        *,
        event_type: str,
        content: Mapping[str, object],
        merge_content: bool = False,
    ) -> None:
        for event in initial_state:
            if event.get("type") == event_type and event.get("state_key", "") == "":
                if merge_content and isinstance(event.get("content"), Mapping):
                    existing_content = cast(Mapping[str, object], event["content"])
                    merged = dict(existing_content)
                    merged.update(content)
                    event["content"] = merged
                else:
                    event["content"] = dict(content)
                return

        initial_state.append(
            {"type": event_type, "state_key": "", "content": dict(content)}
        )

    @staticmethod
    def _validate_channel_type(content: Mapping[str, object]) -> None:
        channel_type = content.get("channel_type")
        if channel_type not in ROOM_TEMPLATES:
            raise ValueError(
                "m.blackout.channel.type requires a supported channel_type"
            )

    @staticmethod
    def _validate_governance_proposal(content: Mapping[str, object]) -> None:
        required = ("proposal_id", "title", "options", "opens_at", "closes_at")
        missing = [key for key in required if key not in content]
        if missing:
            raise ValueError(f"governance proposal missing required fields: {missing}")

        options = content["options"]
        if not isinstance(options, Sequence) or isinstance(options, (str, bytes)):
            raise ValueError(
                "governance proposal options must contain at least two entries"
            )
        if len(options) < 2:
            raise ValueError(
                "governance proposal options must contain at least two entries"
            )
        if not all(isinstance(option, str) and option for option in options):
            raise ValueError("governance proposal options must be non-empty strings")

    @staticmethod
    def _validate_governance_vote(content: Mapping[str, object]) -> None:
        required = ("proposal_id", "vote")
        missing = [key for key in required if key not in content]
        if missing:
            raise ValueError(f"governance vote missing required fields: {missing}")

        if not isinstance(content["vote"], str) or not content["vote"]:
            raise ValueError("governance vote requires non-empty string vote")

    @staticmethod
    def _validate_governance_attestation(content: Mapping[str, object]) -> None:
        required = ("proposal_id", "decision", "attested_by", "attestation_ref")
        missing = [key for key in required if key not in content]
        if missing:
            raise ValueError(
                f"governance attestation missing required fields: {missing}"
            )
        if not isinstance(content["attestation_ref"], str) or not content[
            "attestation_ref"
        ]:
            raise ValueError("governance attestation requires attestation_ref")

    @staticmethod
    def _validate_reputation_update(content: Mapping[str, object]) -> None:
        required = ("node_id", "delta", "reason")
        missing = [key for key in required if key not in content]
        if missing:
            raise ValueError(f"reputation update missing required fields: {missing}")

        if not isinstance(content["delta"], (int, float)):
            raise ValueError("reputation update delta must be numeric")

    @staticmethod
    def _validate_paid_room_state(content: Mapping[str, object]) -> None:
        if not isinstance(content.get("paid_room"), bool):
            raise ValueError("paid room state requires boolean paid_room")
        plan_tier = content.get("plan_tier")
        if plan_tier is not None and (
            not isinstance(plan_tier, str) or not plan_tier.strip()
        ):
            raise ValueError("paid room state plan_tier must be non-empty string")

    @staticmethod
    def _validate_boost_state(content: Mapping[str, object]) -> None:
        tier = content.get("boost_tier")
        if not isinstance(tier, int) or tier < 0 or tier > 10:
            raise ValueError("boost state boost_tier must be integer 0..10")
        expiry = content.get("boost_expiry_ts")
        if not isinstance(expiry, int) or expiry <= 0:
            raise ValueError("boost state boost_expiry_ts must be positive integer")
        if not isinstance(content.get("boost_id"), str) or not content["boost_id"]:
            raise ValueError("boost state requires non-empty boost_id")

    @staticmethod
    def _validate_deliberation_proposal(content: Mapping[str, object]) -> None:
        required = ("workflow_id", "title", "options", "opens_at", "closes_at")
        missing = [key for key in required if key not in content]
        if missing:
            raise ValueError(f"deliberation proposal missing required fields: {missing}")
        options = content["options"]
        if not isinstance(options, Sequence) or isinstance(options, (str, bytes)):
            raise ValueError("deliberation proposal options must be a list")
        if len(options) < 2 or not all(
            isinstance(option, str) and option for option in options
        ):
            raise ValueError(
                "deliberation proposal options must contain at least two non-empty strings"
            )

    @staticmethod
    def _validate_deliberation_vote(content: Mapping[str, object]) -> None:
        if not isinstance(content.get("workflow_id"), str) or not content["workflow_id"]:
            raise ValueError("deliberation vote requires non-empty workflow_id")
        if not isinstance(content.get("vote"), str) or not content["vote"]:
            raise ValueError("deliberation vote requires non-empty vote")

    @staticmethod
    def _validate_deliberation_execution(content: Mapping[str, object]) -> None:
        required = ("workflow_id", "decision", "executed_at")
        missing = [key for key in required if key not in content]
        if missing:
            raise ValueError(f"deliberation execution missing required fields: {missing}")
        if not isinstance(content["decision"], str) or not content["decision"]:
            raise ValueError("deliberation execution requires non-empty decision")
        if not isinstance(content["executed_at"], int) or content["executed_at"] <= 0:
            raise ValueError("deliberation execution requires positive executed_at")

    @staticmethod
    def _validate_townhall_session(content: Mapping[str, object]) -> None:
        required = ("session_id", "title", "starts_at", "ends_at", "state")
        missing = [key for key in required if key not in content]
        if missing:
            raise ValueError(f"townhall session missing required fields: {missing}")
        if content.get("state") not in {"scheduled", "live", "closed"}:
            raise ValueError("townhall session state must be scheduled|live|closed")

    @staticmethod
    def _validate_townhall_agenda(content: Mapping[str, object]) -> None:
        required = ("session_id", "item_id", "topic", "order")
        missing = [key for key in required if key not in content]
        if missing:
            raise ValueError(f"townhall agenda missing required fields: {missing}")
        if not isinstance(content["order"], int) or content["order"] < 0:
            raise ValueError("townhall agenda order must be non-negative integer")

    @staticmethod
    def _validate_townhall_summary(content: Mapping[str, object]) -> None:
        required = ("session_id", "summary_id", "highlights", "published_at")
        missing = [key for key in required if key not in content]
        if missing:
            raise ValueError(f"townhall summary missing required fields: {missing}")
        highlights = content["highlights"]
        if not isinstance(highlights, Sequence) or isinstance(highlights, (str, bytes)):
            raise ValueError("townhall summary highlights must be a list")
        if not all(isinstance(item, str) and item for item in highlights):
            raise ValueError("townhall summary highlights must be non-empty strings")

    @staticmethod
    def _validate_announcement_policy(content: Mapping[str, object]) -> None:
        sender_roles = content.get("sender_roles")
        if not isinstance(sender_roles, list) or not sender_roles:
            raise ValueError("announcement policy requires non-empty sender_roles")
        if not all(isinstance(role, str) and role for role in sender_roles):
            raise ValueError(
                "announcement policy sender_roles must be non-empty strings"
            )

        fanout_mode = content.get("fanout_mode")
        if fanout_mode not in {"immediate", "delayed_window"}:
            raise ValueError(
                "announcement policy fanout_mode must be immediate or delayed_window"
            )

        if fanout_mode == "delayed_window":
            min_ms = content.get("delayed_fanout_min_ms")
            max_ms = content.get("delayed_fanout_max_ms")
            rollback_ref = content.get("rollback_procedure_ref")
            if (
                not isinstance(min_ms, int)
                or not isinstance(max_ms, int)
                or min_ms < 1
                or max_ms < min_ms
            ):
                raise ValueError(
                    "announcement policy delayed fanout bounds are invalid"
                )
            if not isinstance(rollback_ref, str) or not rollback_ref:
                raise ValueError(
                    "announcement policy delayed fanout requires rollback_procedure_ref"
                )

    @staticmethod
    def _validate_stego_policy(content: Mapping[str, object]) -> None:
        allow_stego = content.get("allow_stego")
        if not isinstance(allow_stego, bool):
            raise ValueError("stego policy requires boolean allow_stego")

        ttl_hours = content.get("max_ttl_hours")
        if ttl_hours is not None:
            if not isinstance(ttl_hours, int) or ttl_hours < 1 or ttl_hours > 72:
                raise ValueError("stego policy max_ttl_hours must be 1..72")

    @staticmethod
    def _validate_stego_entitlements(content: Mapping[str, object]) -> None:
        for user_id, scopes in content.items():
            if not isinstance(user_id, str) or not user_id:
                raise ValueError("stego entitlements requires string user keys")
            if not isinstance(scopes, Sequence) or isinstance(scopes, (str, bytes)):
                raise ValueError("stego entitlements values must be scope lists")
            if not all(isinstance(scope, str) and scope for scope in scopes):
                raise ValueError("stego entitlement scopes must be non-empty strings")

    @staticmethod
    def _validate_delegation_grant(content: Mapping[str, object]) -> None:
        required = ("delegate", "scopes", "expires_at")
        missing = [key for key in required if key not in content]
        if missing:
            raise ValueError(f"delegation grant missing required fields: {missing}")
        if not isinstance(content["delegate"], str) or not content["delegate"]:
            raise ValueError("delegation grant requires non-empty delegate")
        scopes = content["scopes"]
        if (
            not isinstance(scopes, Sequence)
            or isinstance(scopes, (str, bytes))
            or not scopes
        ):
            raise ValueError("delegation grant requires non-empty scopes list")
        if not all(isinstance(scope, str) and scope for scope in scopes):
            raise ValueError("delegation grant scopes must be non-empty strings")
        if not isinstance(content["expires_at"], int) or content["expires_at"] <= 0:
            raise ValueError("delegation grant expires_at must be a positive integer")

    @staticmethod
    def _validate_attestation(content: Mapping[str, object]) -> None:
        required = ("node_id", "subject_user_id", "proof")
        missing = [key for key in required if key not in content]
        if missing:
            raise ValueError(f"attestation missing required fields: {missing}")
        if not isinstance(content["proof"], str) or len(content["proof"]) < 16:
            raise ValueError("attestation proof must be a non-empty signature string")


class BlackoutPresenceService:
    def __init__(self) -> None:
        self._presence: Dict[str, str] = {}

    def set_presence(self, user_id: str, state: str) -> None:
        if state not in _ALLOWED_PRESENCE:
            raise ValueError(f"Unsupported blackout presence state: {state}")
        self._presence[user_id] = state

    def get_presence(self, user_id: str) -> str | None:
        return self._presence.get(user_id)

    def bulk_get(self, user_ids: Iterable[str]) -> Dict[str, str]:
        return {
            user_id: state
            for user_id in user_ids
            if (state := self._presence.get(user_id))
        }
