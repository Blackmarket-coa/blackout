# Copyright 2026 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

import os
from unittest.mock import patch

from synapse.config.homeserver import HomeServerConfig

from tests.unittest import TestCase
from tests.utils import default_config


class MonetizationConfigTestCase(TestCase):
    def parse_config(self, config_dict):
        config = HomeServerConfig()
        config.parse_config_dict(config_dict, "", "")
        return config

    def test_env_wiring_for_provider_key_and_webhook_secret(self) -> None:
        config_dict = default_config("test")
        config_dict["monetization"] = {"enabled": True}

        with patch.dict(
            os.environ,
            {
                "BLACKOUT_BILLING_PROVIDER_API_KEY": "env-provider-key",
                "BLACKOUT_BILLING_WEBHOOK_SECRET": "env-webhook-secret",
            },
            clear=False,
        ):
            config = self.parse_config(config_dict)

        self.assertEqual(config.monetization.billing_provider_api_key, "env-provider-key")
        self.assertEqual(
            config.monetization.billing_webhook_secret, "env-webhook-secret"
        )

    def test_config_values_override_env(self) -> None:
        config_dict = default_config("test")
        config_dict["monetization"] = {
            "enabled": True,
            "billing_provider_api_key": "cfg-provider-key",
            "billing_webhook_secret": "cfg-webhook-secret",
        }

        with patch.dict(
            os.environ,
            {
                "BLACKOUT_BILLING_PROVIDER_API_KEY": "env-provider-key",
                "BLACKOUT_BILLING_WEBHOOK_SECRET": "env-webhook-secret",
            },
            clear=False,
        ):
            config = self.parse_config(config_dict)

        self.assertEqual(config.monetization.billing_provider_api_key, "cfg-provider-key")
        self.assertEqual(
            config.monetization.billing_webhook_secret, "cfg-webhook-secret"
        )
