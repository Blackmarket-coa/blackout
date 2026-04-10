from __future__ import annotations

import fnmatch
import json
from dataclasses import dataclass
from typing import Any, Iterable, List, Mapping, Sequence, Tuple


@dataclass(frozen=True)
class PushRule:
    rule_id: str
    priority_class: int
    conditions: Sequence[Mapping[str, Any]]
    actions: Sequence[Any]
    default: bool = False

    @classmethod
    def from_db(
        cls,
        rule_id: str,
        priority_class: int,
        conditions: str,
        actions: str,
    ) -> "PushRule":
        parsed_conditions = json.loads(conditions)
        parsed_actions = json.loads(actions)
        return cls(
            rule_id=rule_id,
            priority_class=priority_class,
            conditions=parsed_conditions,
            actions=parsed_actions,
            default=rule_id.startswith("global/"),
        )


class PushRules:
    def __init__(self, rules: Sequence[PushRule]):
        self._rules = list(rules)

    @property
    def rules(self) -> Sequence[PushRule]:
        return self._rules


class FilteredPushRules:
    def __init__(
        self,
        push_rules: PushRules,
        enabled_map: Mapping[str, bool],
        **_kwargs: Any,
    ):
        self._rules = list(push_rules.rules)
        self._enabled_map = dict(enabled_map)

    def rules(self) -> Iterable[Tuple[PushRule, bool]]:
        for rule in self._rules:
            yield rule, self._enabled_map.get(rule.rule_id, True)


class PushRuleEvaluator:
    def __init__(
        self,
        flattened_event: Mapping[str, Any],
        has_mentions: bool,
        room_member_count: int,
        sender_power_level: int,
        notification_levels: Mapping[str, Any],
        related_events: Mapping[str, Mapping[str, Any]],
        related_event_match_enabled: bool,
        msc3931_push_features: Sequence[str],
        msc1767_enabled: bool,
    ):
        self._event = flattened_event
        self._has_mentions = has_mentions
        self._room_member_count = room_member_count
        self._sender_power_level = sender_power_level
        self._notification_levels = notification_levels

    def run(
        self, rules: FilteredPushRules, uid: str, display_name: str | None
    ) -> List[Any]:
        for rule, enabled in rules.rules():
            if not enabled:
                continue
            if self._rule_matches(rule, uid, display_name):
                return list(rule.actions)
        return []

    def _rule_matches(self, rule: PushRule, uid: str, display_name: str | None) -> bool:
        return all(
            self._condition_matches(cond, uid, display_name) for cond in rule.conditions
        )

    def _condition_matches(
        self, cond: Mapping[str, Any], uid: str, display_name: str | None
    ) -> bool:
        kind = cond.get("kind")

        if kind == "contains_display_name":
            if not display_name:
                return False
            body = self._event.get("content.body")
            return isinstance(body, str) and display_name in body

        if kind == "event_match":
            key = cond.get("key")
            if not isinstance(key, str):
                return False
            pattern = cond.get("pattern")
            value = self._event.get(key)
            if not isinstance(value, str) or not isinstance(pattern, str):
                return False
            return fnmatch.fnmatchcase(value, pattern)

        if kind == "event_property_is":
            key = cond.get("key")
            if not isinstance(key, str):
                return False
            return self._event.get(key) == cond.get("value")

        if kind == "sender_notification_permission":
            key = cond.get("key")
            required = self._notification_levels.get(key, 50)
            try:
                required_int = int(required)
            except (TypeError, ValueError):
                required_int = 50
            return self._sender_power_level >= required_int

        if kind == "room_member_count":
            # Supported forms like "==2", ">=2", "<10".
            is_expr = cond.get("is")
            if not isinstance(is_expr, str):
                return False
            for op in ("<=", ">=", "==", "<", ">"):
                if is_expr.startswith(op):
                    try:
                        expected = int(is_expr[len(op) :])
                    except ValueError:
                        return False
                    current = self._room_member_count
                    return {
                        "<=": current <= expected,
                        ">=": current >= expected,
                        "==": current == expected,
                        "<": current < expected,
                        ">": current > expected,
                    }[op]
            return False

        # Unknown conditions are treated as non-match.
        return False


def get_base_rule_ids() -> List[str]:
    # Keep this list conservative and compatible with default Matrix push rules.
    return [
        ".m.rule.master",
        ".m.rule.suppress_notices",
        ".m.rule.invite_for_me",
        ".m.rule.member_event",
        ".m.rule.contains_display_name",
        ".m.rule.tombstone",
        ".m.rule.roomnotif",
        ".m.rule.reaction",
        ".m.rule.room_one_to_one",
        ".m.rule.encrypted_room_one_to_one",
        ".m.rule.message",
        ".m.rule.encrypted",
        ".m.rule.call",
        ".m.rule.poll_start",
        ".m.rule.poll_response",
        ".m.rule.poll_end",
    ]
