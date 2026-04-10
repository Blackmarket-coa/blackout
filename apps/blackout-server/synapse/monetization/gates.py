# Copyright 2026 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from typing import Mapping, Protocol, Set

from synapse.monetization.model import SubscriptionTier, UserEntitlement


class EntitlementResolver(Protocol):
    async def get_entitlement(self, user_id: str) -> UserEntitlement:
        """Fetch entitlement state for a user."""


class FeatureGate(Protocol):
    async def is_enabled_for(self, user_id: str, feature: str) -> bool:
        """Return whether a feature is enabled for a user."""


class TieredFeatureGate:
    """Simple feature gate based on minimum subscription tier membership."""

    def __init__(self, resolver: EntitlementResolver, tier_features: Mapping[str, Set[str]]):
        self._resolver = resolver
        self._tier_features = tier_features

    async def is_enabled_for(self, user_id: str, feature: str) -> bool:
        entitlement = await self._resolver.get_entitlement(user_id)
        enabled_features = self._tier_features.get(entitlement.tier.value, set())
        return feature in enabled_features

