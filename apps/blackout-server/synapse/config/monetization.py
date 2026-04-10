# Copyright 2026 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import os
from typing import Any

from synapse.config._base import Config
from synapse.types import JsonDict


class MonetizationConfig(Config):
    """Config section for billing/entitlement foundations."""

    section = "monetization"

    def read_config(self, config: JsonDict, **kwargs: Any) -> None:
        monetization = config.get("monetization") or {}

        self.monetization_enabled = monetization.get("enabled", False)
        self.billing_provider = monetization.get("billing_provider", "stub")
        self.default_tier = monetization.get("default_tier", "free")

        self.billing_provider_api_key = monetization.get(
            "billing_provider_api_key",
            os.environ.get("BLACKOUT_BILLING_PROVIDER_API_KEY"),
        )
        self.billing_webhook_secret = monetization.get(
            "billing_webhook_secret",
            os.environ.get("BLACKOUT_BILLING_WEBHOOK_SECRET"),
        )

    def generate_config_section(self, **kwargs: Any) -> str:
        return """
        ## Monetization phase-0 foundations (disabled by default).
        ##
        ## This section only wires tier and webhook processing primitives and does not
        ## change Matrix protocol behavior.
        #
        #monetization:
        #  enabled: false
        #
        #  # Provider identifier used for logging and webhook processing.
        #  billing_provider: "stub"
        #
        #  # Baseline entitlement tier for accounts without an active subscription.
        #  default_tier: "free"
        #
        #  # Secret inputs. For production, provide via environment variables or a
        #  # secret management system.
        #  billing_provider_api_key: "env:BLACKOUT_BILLING_PROVIDER_API_KEY"
        #  billing_webhook_secret: "env:BLACKOUT_BILLING_WEBHOOK_SECRET"
        """
