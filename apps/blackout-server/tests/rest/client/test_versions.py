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

from synapse.rest.client import versions

from tests import unittest
from tests.unittest import override_config


class VersionsServletTestCase(unittest.HomeserverTestCase):
    servlets = [versions.register_servlets]

    def test_versions_smoke_compatibility(self) -> None:
        channel = self.make_request(
            "GET", "/_matrix/client/versions", content={}, access_token=None
        )

        self.assertEqual(channel.code, 200, channel.result)
        self.assertIn("r0.6.1", channel.json_body["versions"])
        self.assertIn("v1.9", channel.json_body["versions"])
        self.assertIsInstance(channel.json_body["unstable_features"], dict)

    def test_blackout_fork_flag_disabled_by_default(self) -> None:
        channel = self.make_request(
            "GET", "/_matrix/client/versions", content={}, access_token=None
        )

        self.assertEqual(channel.code, 200, channel.result)
        self.assertNotIn(
            "io.blackout.product_fork",
            channel.json_body["unstable_features"],
        )

    @override_config(
        {"experimental_features": {"blackout_versions_feature_flag": True}}
    )
    def test_blackout_fork_flag_advertised_when_enabled(self) -> None:
        channel = self.make_request(
            "GET", "/_matrix/client/versions", content={}, access_token=None
        )

        self.assertEqual(channel.code, 200, channel.result)
        self.assertEqual(
            channel.json_body["unstable_features"]["io.blackout.product_fork"], True
        )
