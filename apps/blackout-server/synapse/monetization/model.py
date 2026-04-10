# Copyright 2026 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class SubscriptionTier(str, Enum):
    FREE = "free"
    SIGNAL = "signal"
    COALITION = "coalition"
    SOVEREIGN = "sovereign"
    ENTERPRISE = "enterprise"


class EntitlementStatus(str, Enum):
    ACTIVE = "active"
    DOWNGRADED = "downgraded"
    CANCELED = "canceled"


class MonetizationTransition(str, Enum):
    UPGRADE = "upgrade"
    DOWNGRADE = "downgrade"
    CANCEL = "cancel"


@dataclass(frozen=True)
class UserEntitlement:
    user_id: str
    tier: SubscriptionTier
    status: EntitlementStatus
    updated_ts: int
    source_event_id: Optional[str] = None
    billing_customer_id: Optional[str] = None
    billing_subscription_id: Optional[str] = None

