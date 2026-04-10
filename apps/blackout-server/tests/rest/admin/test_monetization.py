# Copyright 2026 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

import synapse.rest.admin

from tests import unittest


class MonetizationWebhookTestCase(unittest.HomeserverTestCase):
    servlets = [synapse.rest.admin.register_servlets]

    def default_config(self):
        config = super().default_config()
        config["monetization"] = {
            "enabled": True,
            "billing_provider": "stub",
            "billing_webhook_secret": "test-webhook-secret",
            "default_tier": "free",
        }
        return config

    def _post_webhook(self, body):
        return self.make_request(
            "POST",
            "/_synapse/admin/v1/monetization/webhook",
            content=body,
            access_token=None,
            custom_headers=[(b"X-Blackout-Webhook-Secret", b"test-webhook-secret")],
        )

    def test_upgrade_downgrade_cancel_transitions(self) -> None:
        user_id = "@alice:test"

        upgrade = self._post_webhook(
            {
                "event_id": "evt-upgrade-1",
                "event_type": "subscription.updated",
                "transition": "upgrade",
                "user_id": user_id,
                "tier": "coalition",
            }
        )
        self.assertEqual(200, upgrade.code, upgrade.result)
        self.assertEqual(True, upgrade.json_body["processed"])
        self.assertEqual("coalition", upgrade.json_body["tier"])
        self.assertEqual("active", upgrade.json_body["status"])

        downgrade = self._post_webhook(
            {
                "event_id": "evt-downgrade-1",
                "event_type": "subscription.updated",
                "transition": "downgrade",
                "user_id": user_id,
                "tier": "signal",
            }
        )
        self.assertEqual(200, downgrade.code, downgrade.result)
        self.assertEqual("signal", downgrade.json_body["tier"])
        self.assertEqual("downgraded", downgrade.json_body["status"])

        cancel = self._post_webhook(
            {
                "event_id": "evt-cancel-1",
                "event_type": "subscription.deleted",
                "transition": "cancel",
                "user_id": user_id,
            }
        )
        self.assertEqual(200, cancel.code, cancel.result)
        self.assertEqual("free", cancel.json_body["tier"])
        self.assertEqual("canceled", cancel.json_body["status"])

    def test_idempotent_webhook_processing(self) -> None:
        body = {
            "event_id": "evt-replay-1",
            "event_type": "subscription.updated",
            "transition": "upgrade",
            "user_id": "@bob:test",
            "tier": "enterprise",
        }
        first = self._post_webhook(body)
        self.assertEqual(200, first.code, first.result)
        self.assertEqual(True, first.json_body["processed"])

        second = self._post_webhook(body)
        self.assertEqual(200, second.code, second.result)
        self.assertEqual(False, second.json_body["processed"])
        self.assertEqual("enterprise", second.json_body["tier"])
        self.assertEqual("active", second.json_body["status"])
        self.assertEqual("evt-replay-1", second.json_body["source_event_id"])
