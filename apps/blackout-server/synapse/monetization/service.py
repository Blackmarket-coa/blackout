# Copyright 2026 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from typing import Optional, Tuple

from synapse.api.errors import SynapseError
from synapse.monetization.model import (
    EntitlementStatus,
    MonetizationTransition,
    SubscriptionTier,
    UserEntitlement,
)
from synapse.types import JsonDict


class MonetizationService:
    def __init__(self, store, provider: str):
        self._store = store
        self._provider = provider

    async def process_webhook_payload(
        self, payload: JsonDict, received_ts: int
    ) -> Tuple[bool, UserEntitlement]:
        event_id = payload.get("event_id")
        event_type = payload.get("event_type")
        transition_value = payload.get("transition")
        user_id = payload.get("user_id")
        target_tier = payload.get("tier")

        if not isinstance(event_id, str) or not event_id:
            raise SynapseError(400, "event_id must be a non-empty string")
        if not isinstance(event_type, str) or not event_type:
            raise SynapseError(400, "event_type must be a non-empty string")
        if not isinstance(user_id, str) or not user_id:
            raise SynapseError(400, "user_id must be a non-empty string")
        if not isinstance(transition_value, str) or not transition_value:
            raise SynapseError(400, "transition must be a non-empty string")

        try:
            transition = MonetizationTransition(transition_value)
        except ValueError as exc:
            raise SynapseError(400, "transition must be one of: upgrade, downgrade, cancel") from exc

        tier: SubscriptionTier
        status: EntitlementStatus

        if transition == MonetizationTransition.CANCEL:
            tier = SubscriptionTier.FREE
            status = EntitlementStatus.CANCELED
        else:
            if not isinstance(target_tier, str) or not target_tier:
                raise SynapseError(400, "tier must be a non-empty string")
            try:
                tier = SubscriptionTier(target_tier)
            except ValueError as exc:
                raise SynapseError(
                    400,
                    "tier must be one of: free, signal, coalition, sovereign, enterprise",
                ) from exc
            status = (
                EntitlementStatus.ACTIVE
                if transition == MonetizationTransition.UPGRADE
                else EntitlementStatus.DOWNGRADED
            )

        billing_customer_id = _str_or_none(payload.get("billing_customer_id"))
        billing_subscription_id = _str_or_none(payload.get("billing_subscription_id"))

        return await self._store.process_webhook_transition(
            event_id=event_id,
            provider=self._provider,
            event_type=event_type,
            user_id=user_id,
            tier=tier,
            status=status,
            source_event_id=event_id,
            billing_customer_id=billing_customer_id,
            billing_subscription_id=billing_subscription_id,
            received_ts=received_ts,
        )


def _str_or_none(value: Optional[object]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return str(value)
