# Copyright 2026 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from typing import TYPE_CHECKING, Optional, Tuple

from synapse.monetization.model import EntitlementStatus, SubscriptionTier, UserEntitlement
from synapse.storage._base import SQLBaseStore
from synapse.storage.database import DatabasePool, LoggingDatabaseConnection, LoggingTransaction

if TYPE_CHECKING:
    from synapse.server import HomeServer


class MonetizationStore(SQLBaseStore):
    def __init__(
        self,
        database: DatabasePool,
        db_conn: LoggingDatabaseConnection,
        hs: "HomeServer",
    ):
        super().__init__(database, db_conn, hs)

    async def get_entitlement(self, user_id: str) -> UserEntitlement:
        row = await self.db_pool.simple_select_one_onecol(
            table="blackout_user_entitlements",
            keyvalues={"user_id": user_id},
            retcol="tier",
            allow_none=True,
            desc="get_entitlement_tier",
        )

        if row is None:
            return UserEntitlement(
                user_id=user_id,
                tier=SubscriptionTier(self.hs.config.monetization.default_tier),
                status=EntitlementStatus.ACTIVE,
                updated_ts=0,
            )

        entitlement_row = await self.db_pool.simple_select_one(
            table="blackout_user_entitlements",
            keyvalues={"user_id": user_id},
            retcols=(
                "tier",
                "status",
                "updated_ts",
                "source_event_id",
                "billing_customer_id",
                "billing_subscription_id",
            ),
            allow_none=False,
            desc="get_entitlement",
        )

        return UserEntitlement(
            user_id=user_id,
            tier=SubscriptionTier(entitlement_row["tier"]),
            status=EntitlementStatus(entitlement_row["status"]),
            updated_ts=entitlement_row["updated_ts"],
            source_event_id=entitlement_row["source_event_id"],
            billing_customer_id=entitlement_row["billing_customer_id"],
            billing_subscription_id=entitlement_row["billing_subscription_id"],
        )

    async def process_webhook_transition(
        self,
        *,
        event_id: str,
        provider: str,
        event_type: str,
        user_id: str,
        tier: SubscriptionTier,
        status: EntitlementStatus,
        source_event_id: Optional[str],
        billing_customer_id: Optional[str],
        billing_subscription_id: Optional[str],
        received_ts: int,
    ) -> Tuple[bool, UserEntitlement]:
        """Process webhook event idempotently.

        Returns:
            (processed, current_entitlement), where processed=False indicates
            the event_id had already been handled.
        """

        def _process_webhook_transition_txn(
            txn: LoggingTransaction,
        ) -> Tuple[bool, UserEntitlement]:
            txn.execute(
                """
                SELECT event_id FROM blackout_billing_webhook_events WHERE event_id = ?
                """,
                (event_id,),
            )
            if txn.fetchone():
                txn.execute(
                    """
                    SELECT tier, status, updated_ts, source_event_id, billing_customer_id, billing_subscription_id
                    FROM blackout_user_entitlements WHERE user_id = ?
                    """,
                    (user_id,),
                )
                current = txn.fetchone()
                if current is None:
                    return (
                        False,
                        UserEntitlement(
                            user_id=user_id,
                            tier=SubscriptionTier(self.hs.config.monetization.default_tier),
                            status=EntitlementStatus.ACTIVE,
                            updated_ts=0,
                        ),
                    )

                return (
                    False,
                    UserEntitlement(
                        user_id=user_id,
                        tier=SubscriptionTier(current[0]),
                        status=EntitlementStatus(current[1]),
                        updated_ts=current[2],
                        source_event_id=current[3],
                        billing_customer_id=current[4],
                        billing_subscription_id=current[5],
                    ),
                )

            txn.execute(
                """
                INSERT INTO blackout_billing_webhook_events
                    (event_id, provider, event_type, received_ts, processed_ts, status)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (event_id, provider, event_type, received_ts, received_ts, "processed"),
            )

            self.db_pool.simple_upsert_txn(
                txn=txn,
                table="blackout_user_entitlements",
                keyvalues={"user_id": user_id},
                values={
                    "tier": tier.value,
                    "status": status.value,
                    "updated_ts": received_ts,
                    "source_event_id": source_event_id,
                    "billing_customer_id": billing_customer_id,
                    "billing_subscription_id": billing_subscription_id,
                },
            )

            return (
                True,
                UserEntitlement(
                    user_id=user_id,
                    tier=tier,
                    status=status,
                    updated_ts=received_ts,
                    source_event_id=source_event_id,
                    billing_customer_id=billing_customer_id,
                    billing_subscription_id=billing_subscription_id,
                ),
            )

        return await self.db_pool.runInteraction(
            "process_webhook_transition", _process_webhook_transition_txn
        )
