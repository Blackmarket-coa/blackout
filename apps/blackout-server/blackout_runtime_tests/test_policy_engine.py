import pytest

from blackout_runtime.policy_engine import (
    DEFAULT_FEATURE_FLAGS,
    NON_PERSISTED_EVENT_TYPES,
    PERSISTED_EVENT_TYPES,
    BlackoutPolicyEngine,
    RollbackCriteria,
)


def test_default_feature_flags_are_disabled() -> None:
    engine = BlackoutPolicyEngine()
    for flag, enabled in DEFAULT_FEATURE_FLAGS.items():
        assert engine.feature_enabled(flag) is enabled


def test_phase_1_presets_require_feature_flags() -> None:
    engine = BlackoutPolicyEngine()

    with pytest.raises(ValueError, match="cell_governance_templates"):
        engine.build_room_preset("blackout_cell_space")

    engine = BlackoutPolicyEngine(
        {
            "cell_governance_templates": True,
            "dead_drop_room_preset": True,
            "announcement_room_preset": True,
        }
    )
    cell = engine.build_room_preset("blackout_cell_space")
    dead_drop = engine.build_room_preset("blackout_dead_drop_room", ttl_hours=12)
    announce = engine.build_room_preset("blackout_announcement_room")

    assert cell["visibility"] == "private"
    assert dead_drop["retention_ttl_hours"] == 12
    assert announce["sender_roles"] == ["announcer", "moderator"]


def test_delayed_announcement_requires_explicit_rollback_and_window() -> None:
    engine = BlackoutPolicyEngine(
        {
            "announcement_room_preset": True,
            "delayed_broadcast_fanout": True,
        }
    )

    with pytest.raises(ValueError, match="min and max"):
        engine.build_room_preset(
            "blackout_announcement_room", fanout_mode="delayed_window"
        )

    delayed = engine.build_room_preset(
        "blackout_announcement_room",
        fanout_mode="delayed_window",
        delayed_fanout_min_seconds=5,
        delayed_fanout_max_seconds=10,
        rollback_procedure_ref="docs/blackout-ops-runbook.md#rollback-procedure",
    )

    assert delayed["delayed_fanout_min_seconds"] == 5
    assert delayed["delayed_fanout_max_seconds"] == 10
    assert delayed["rollback_procedure_ref"]


def test_dead_drop_retention_bounds() -> None:
    engine = BlackoutPolicyEngine({"dead_drop_room_preset": True})
    with pytest.raises(ValueError, match="between 1 and 168"):
        engine.build_room_preset("blackout_dead_drop_room", ttl_hours=169)


def test_membership_visibility_boundary_enforcement() -> None:
    engine = BlackoutPolicyEngine({"cell_governance_templates": True})

    assert engine.enforce_membership_boundary(
        chapter_id="cell-a", member_chapter_id="cell-a"
    )
    assert not engine.enforce_membership_boundary(
        chapter_id="cell-a", member_chapter_id="cell-b"
    )


def test_sender_role_enforcement_for_announcements() -> None:
    engine = BlackoutPolicyEngine({"announcement_room_preset": True})

    assert engine.can_sender_broadcast("announcer")
    assert engine.can_sender_broadcast("moderator")
    assert not engine.can_sender_broadcast("member")


def test_trust_tier_acl_templates() -> None:
    engine = BlackoutPolicyEngine()

    restricted = engine.trust_tier_acl("restricted")
    assert restricted["deny"] == ["*"]

    restricted["allow"].append("should-not-mutate-default")
    assert (
        "should-not-mutate-default" not in engine.trust_tier_acl("restricted")["allow"]
    )


def test_experimental_timing_delay_and_rollback_criteria() -> None:
    engine = BlackoutPolicyEngine(
        {
            "timing_jitter_worker": True,
            "delayed_broadcast_fanout": True,
            "announcement_room_preset": True,
        }
    )

    jitter_ms = engine.compute_jitter_delay_ms(min_seconds=5, max_seconds=30)
    fanout_ms = engine.choose_broadcast_delay_ms(min_seconds=10, max_seconds=20)

    assert 5_000 <= jitter_ms <= 30_000
    assert 10_000 <= fanout_ms <= 20_000

    decision = engine.evaluate_pilot_guardrail(
        observed_value=1.8,
        criteria=RollbackCriteria(
            metric="pilot.p95_delivery_latency_seconds",
            threshold=1.5,
            comparator=">",
            runbook_ref="docs/blackout-ops-runbook.md#rollback-procedure",
        ),
    )

    assert decision.should_rollback
    assert "rollback" in decision.reason


def test_rollback_criteria_requires_runbook_reference() -> None:
    engine = BlackoutPolicyEngine({"timing_jitter_worker": True})

    with pytest.raises(ValueError, match="runbook"):
        engine.evaluate_pilot_guardrail(
            observed_value=1.0,
            criteria=RollbackCriteria(
                metric="pilot.p95_delivery_latency_seconds",
                threshold=1.5,
                comparator=">",
                runbook_ref="",
            ),
        )


def test_policy_matrix_persisted_surfaces_are_classified_as_persisted() -> None:
    engine = BlackoutPolicyEngine()

    for event_type in PERSISTED_EVENT_TYPES:
        assert (
            engine.classify_event_persistence(event_type, is_state_event=True)
            == "persisted"
        )


def test_policy_matrix_non_persisted_surfaces_are_not_persisted() -> None:
    engine = BlackoutPolicyEngine()

    for event_type in NON_PERSISTED_EVENT_TYPES:
        assert (
            engine.classify_event_persistence(event_type, is_state_event=False)
            == "blocked"
        )


def test_policy_matrix_unknown_timeline_events_are_marked_unsupported() -> None:
    engine = BlackoutPolicyEngine()

    assert (
        engine.classify_event_persistence("m.room.topic", is_state_event=False)
        == "unsupported"
    )
