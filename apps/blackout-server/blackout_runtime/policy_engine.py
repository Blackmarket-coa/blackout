from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Dict, Literal, Mapping, MutableMapping, Optional, Sequence

DEFAULT_FEATURE_FLAGS: Dict[str, bool] = {
    "cell_governance_templates": False,
    "dead_drop_room_preset": False,
    "announcement_room_preset": False,
    "timing_jitter_worker": False,
    "delayed_broadcast_fanout": False,
    "edge_federation_profile": False,
}

PERSISTED_EVENT_TYPES: Dict[str, str] = {
    "m.room.member": "membership_auth_state",
    "m.room.power_levels": "membership_auth_state",
    "m.room.join_rules": "membership_auth_state",
    "m.room.history_visibility": "membership_auth_state",
    "m.room.create": "membership_auth_state",
    "m.room.server_acl": "membership_auth_state",
    "m.blackout.signal": "signaling_ttl",
}

NON_PERSISTED_EVENT_TYPES: Dict[str, str] = {
    "m.room.message": "blocked_payload",
    "m.room.encrypted": "blocked_payload",
    "m.room.redaction": "unsupported_timeline",
    "m.reaction": "unsupported_timeline",
}

FEDERATION_TRUST_TIER_ACLS: Dict[str, Dict[str, Sequence[str]]] = {
    "local": {"allow": ["*.local"], "deny": []},
    "partner": {"allow": ["*.local", "partner.example"], "deny": []},
    "restricted": {"allow": ["*.local"], "deny": ["*"]},
}


@dataclass(frozen=True)
class RollbackCriteria:
    metric: str
    threshold: float
    comparator: Literal[">", "<"]
    runbook_ref: str


@dataclass(frozen=True)
class PilotDecision:
    should_rollback: bool
    reason: str


class BlackoutPolicyEngine:
    def __init__(self, feature_flags: Optional[Mapping[str, bool]] = None) -> None:
        self._feature_flags = dict(DEFAULT_FEATURE_FLAGS)
        if feature_flags:
            self._feature_flags.update(feature_flags)

    def feature_enabled(self, name: str) -> bool:
        return bool(self._feature_flags.get(name, False))

    def build_room_preset(
        self,
        preset_name: str,
        *,
        ttl_hours: Optional[int] = None,
        fanout_mode: str = "immediate",
        delayed_fanout_min_seconds: Optional[int] = None,
        delayed_fanout_max_seconds: Optional[int] = None,
        rollback_procedure_ref: Optional[str] = None,
    ) -> MutableMapping[str, object]:
        if preset_name == "blackout_cell_space":
            self._require("cell_governance_templates")
            return {
                "name": preset_name,
                "visibility": "private",
                "join_rule": "invite",
                "history_visibility": "joined",
                "federation_trust_tier": "local",
            }

        if preset_name == "blackout_dead_drop_room":
            self._require("dead_drop_room_preset")
            value = ttl_hours if ttl_hours is not None else 24
            if value < 1 or value > 168:
                raise ValueError("retention_ttl_hours must be between 1 and 168")
            return {
                "name": preset_name,
                "visibility": "private",
                "join_rule": "invite",
                "history_visibility": "joined",
                "retention_ttl_hours": value,
                "purge_mode": "hard_delete",
                "max_members": 12,
            }

        if preset_name == "blackout_announcement_room":
            self._require("announcement_room_preset")
            if fanout_mode == "delayed_window" and not self.feature_enabled(
                "delayed_broadcast_fanout"
            ):
                raise ValueError(
                    "delayed fanout requires delayed_broadcast_fanout feature"
                )

            config: MutableMapping[str, object] = {
                "name": preset_name,
                "visibility": "private",
                "sender_roles": ["announcer", "moderator"],
                "default_member_power": 0,
                "read_receipt_policy": "minimized",
                "fanout_mode": fanout_mode,
            }

            if fanout_mode == "delayed_window":
                if (
                    delayed_fanout_min_seconds is None
                    or delayed_fanout_max_seconds is None
                ):
                    raise ValueError("delayed fanout requires min and max seconds")
                if (
                    delayed_fanout_min_seconds < 1
                    or delayed_fanout_min_seconds > delayed_fanout_max_seconds
                ):
                    raise ValueError("invalid delayed fanout bounds")
                if not rollback_procedure_ref:
                    raise ValueError("delayed fanout requires rollback_procedure_ref")

                config["delayed_fanout_min_seconds"] = delayed_fanout_min_seconds
                config["delayed_fanout_max_seconds"] = delayed_fanout_max_seconds
                config["rollback_procedure_ref"] = rollback_procedure_ref

            return config

        raise ValueError(f"Unsupported preset: {preset_name}")

    def classify_event_persistence(
        self, event_type: str, *, is_state_event: bool
    ) -> str:
        """Classify event persistence behavior in blackout signaling-only mode.

        Returns one of:
        - ``persisted`` for auth-critical state + ``m.blackout.signal`` metadata.
        - ``blocked`` for known blocked payload timeline event types.
        - ``unsupported`` for timeline events outside the signaling allow-list.
        - ``state_persisted`` for generic state events not explicitly listed.
        """

        if event_type in PERSISTED_EVENT_TYPES:
            return "persisted"

        if event_type in NON_PERSISTED_EVENT_TYPES:
            return "blocked"

        if is_state_event:
            return "state_persisted"

        return "unsupported"

    def enforce_membership_boundary(
        self, *, chapter_id: str, member_chapter_id: str
    ) -> bool:
        return chapter_id == member_chapter_id

    def can_sender_broadcast(self, sender_role: str) -> bool:
        return sender_role in {"announcer", "moderator"}

    def trust_tier_acl(self, tier: str) -> Dict[str, Sequence[str]]:
        if tier not in FEDERATION_TRUST_TIER_ACLS:
            raise ValueError(f"Unsupported trust tier: {tier}")
        acl = FEDERATION_TRUST_TIER_ACLS[tier]
        return {"allow": list(acl["allow"]), "deny": list(acl["deny"])}

    def compute_jitter_delay_ms(self, *, min_seconds: int, max_seconds: int) -> int:
        self._require("timing_jitter_worker")
        if min_seconds < 0 or max_seconds < min_seconds:
            raise ValueError("invalid jitter delay bounds")
        return random.randint(min_seconds, max_seconds) * 1000

    def choose_broadcast_delay_ms(self, *, min_seconds: int, max_seconds: int) -> int:
        self._require("delayed_broadcast_fanout")
        if min_seconds < 1 or max_seconds < min_seconds:
            raise ValueError("invalid delayed fanout bounds")
        return random.randint(min_seconds, max_seconds) * 1000

    def evaluate_pilot_guardrail(
        self,
        *,
        observed_value: float,
        criteria: RollbackCriteria,
    ) -> PilotDecision:
        if not criteria.runbook_ref:
            raise ValueError("rollback criteria requires a runbook reference")

        if criteria.comparator == ">":
            breached = observed_value > criteria.threshold
        else:
            breached = observed_value < criteria.threshold

        if breached:
            return PilotDecision(
                should_rollback=True,
                reason=(
                    f"{criteria.metric} breached {criteria.comparator} {criteria.threshold}; "
                    f"execute rollback via {criteria.runbook_ref}"
                ),
            )

        return PilotDecision(should_rollback=False, reason="within SLO guardrail")

    def _require(self, feature_flag: str) -> None:
        if not self.feature_enabled(feature_flag):
            raise ValueError(f"Feature flag '{feature_flag}' is disabled")
