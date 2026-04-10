from datetime import date

from blackout_runtime.readiness import (
    MigrationStage,
    ReleaseReadinessReview,
    SecurityAuditChecklist,
)


def test_release_readiness_includes_security_and_migration_gates() -> None:
    checklist = SecurityAuditChecklist(
        signatures_verified=True,
        hash_chain_checked=True,
        encrypted_at_rest_and_transit=True,
        replay_protection=True,
        key_revocation_tested=True,
        abuse_controls_validated=True,
    )

    review = ReleaseReadinessReview(
        security_owner="security-owner@blackout",
        encrypted_flow_reviewed=True,
        security_checklist=checklist,
        migration_stages=[
            MigrationStage("dual-write", "release", date(2026, 3, 1)),
            MigrationStage("shadow-read", "release", date(2026, 3, 8)),
            MigrationStage("canary", "release", date(2026, 3, 15)),
            MigrationStage("cutover", "release", date(2026, 3, 22)),
            MigrationStage("rollback", "release", date(2026, 3, 29)),
        ],
    )

    assert review.is_ready()
