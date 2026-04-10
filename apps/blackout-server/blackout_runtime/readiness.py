from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import List


@dataclass(frozen=True)
class SecurityAuditChecklist:
    signatures_verified: bool
    hash_chain_checked: bool
    encrypted_at_rest_and_transit: bool
    replay_protection: bool
    key_revocation_tested: bool
    abuse_controls_validated: bool

    def is_complete(self) -> bool:
        return all(
            (
                self.signatures_verified,
                self.hash_chain_checked,
                self.encrypted_at_rest_and_transit,
                self.replay_protection,
                self.key_revocation_tested,
                self.abuse_controls_validated,
            )
        )


@dataclass(frozen=True)
class MigrationStage:
    name: str
    owner: str
    target_date: date


@dataclass(frozen=True)
class ReleaseReadinessReview:
    security_owner: str
    encrypted_flow_reviewed: bool
    security_checklist: SecurityAuditChecklist
    migration_stages: List[MigrationStage]

    def has_required_migration_stages(self) -> bool:
        required = {"dual-write", "shadow-read", "canary", "cutover", "rollback"}
        names = {stage.name for stage in self.migration_stages}
        return required.issubset(names)

    def is_ready(self) -> bool:
        return (
            self.encrypted_flow_reviewed
            and bool(self.security_owner)
            and self.security_checklist.is_complete()
            and self.has_required_migration_stages()
        )
