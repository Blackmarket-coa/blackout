# Copyright 2016 OpenMarket Ltd
# Copyright 2017 Vector Creations Ltd
# Copyright 2018-2019 New Vector Ltd
# Copyright 2019 The Matrix.org Foundation C.I.C.
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

import logging
import re
from typing import TYPE_CHECKING, Tuple

from twisted.web.server import Request

from synapse.api.constants import RoomCreationPreset
from synapse.http.server import HttpServer
from synapse.http.servlet import RestServlet
from synapse.types import JsonDict

if TYPE_CHECKING:
    from synapse.server import HomeServer

logger = logging.getLogger(__name__)


class VersionsRestServlet(RestServlet):
    PATTERNS = [re.compile("^/_matrix/client/versions$")]
    CATEGORY = "Client API requests"

    def __init__(self, hs: "HomeServer"):
        super().__init__()
        self.config = hs.config

        # Calculate these once since they shouldn't change after start-up.
        self.e2ee_forced_public = (
            RoomCreationPreset.PUBLIC_CHAT
            in self.config.room.encryption_enabled_by_default_for_room_presets
        )
        self.e2ee_forced_private = (
            RoomCreationPreset.PRIVATE_CHAT
            in self.config.room.encryption_enabled_by_default_for_room_presets
        )
        self.e2ee_forced_trusted_private = (
            RoomCreationPreset.TRUSTED_PRIVATE_CHAT
            in self.config.room.encryption_enabled_by_default_for_room_presets
        )

    def on_GET(self, request: Request) -> Tuple[int, JsonDict]:
        unstable_features = {
            # Implements support for label-based filtering as described in
            # MSC2326.
            "org.matrix.label_based_filtering": True,
            # Implements support for cross signing as described in MSC1756
            "org.matrix.e2e_cross_signing": True,
            # Implements additional endpoints as described in MSC2432
            "org.matrix.msc2432": True,
            # Implements additional endpoints as described in MSC2666
            "uk.half-shot.msc2666.query_mutual_rooms": True,
            # Whether new rooms will be set to encrypted or not (based on presets).
            "io.element.e2ee_forced.public": self.e2ee_forced_public,
            "io.element.e2ee_forced.private": self.e2ee_forced_private,
            "io.element.e2ee_forced.trusted_private": self.e2ee_forced_trusted_private,
            # Supports the busy presence state described in MSC3026.
            "org.matrix.msc3026.busy_presence": self.config.experimental.msc3026_enabled,
            # Supports receiving private read receipts as per MSC2285
            # Follow-up (matrix-org/synapse#17444, owner: client-server API
            # team): drop this flag once stable `/versions` capability
            # signalling fully supersedes MSC2285 compat naming.
            "org.matrix.msc2285.stable": True,
            # Supports filtering of /publicRooms by room type as per MSC3827
            "org.matrix.msc3827.stable": True,
            # Adds support for thread relations, per MSC3440.
            # Follow-up (matrix-org/synapse#17445, owner: client-server API
            # team): remove this compat flag after client minimum version
            # policy no longer requires explicit MSC3440 signalling.
            "org.matrix.msc3440.stable": True,
            # Support for thread read receipts & notification counts.
            "org.matrix.msc3771": True,
            "org.matrix.msc3773": self.config.experimental.msc3773_enabled,
            # Allows moderators to fetch redacted event content as described in MSC2815
            "fi.mau.msc2815": self.config.experimental.msc2815_enabled,
            # Adds a ping endpoint for appservices to check HS->AS connection
            # Follow-up (matrix-org/synapse#17446, owner: appservice team):
            # remove this compat flag when legacy appservice clients no
            # longer depend on the MSC2659 name.
            "fi.mau.msc2659.stable": True,
            # Compatibility flag for clients still using unstable MSC3882 support:
            "org.matrix.msc3882": self.config.auth.login_via_existing_enabled,
            # Adds support for remotely enabling/disabling pushers, as per MSC3881
            "org.matrix.msc3881": self.config.experimental.msc3881_enabled,
            # Adds support for filtering /messages by event relation.
            "org.matrix.msc3874": self.config.experimental.msc3874_enabled,
            # Adds support for simple HTTP rendezvous as per MSC3886
            "org.matrix.msc3886": self.config.experimental.msc3886_endpoint is not None,
            # Adds support for relation-based redactions as per MSC3912.
            "org.matrix.msc3912": self.config.experimental.msc3912_enabled,
            # Whether recursively provide relations is supported.
            "org.matrix.msc3981": self.config.experimental.msc3981_recurse_relations,
            # Adds support for deleting account data.
            "org.matrix.msc3391": self.config.experimental.msc3391_enabled,
            # Allows clients to inhibit profile update propagation.
            "org.matrix.msc4069": self.config.experimental.msc4069_profile_inhibit_propagation,
        }

        # Blackout fork compatibility signal. Keep disabled by default and only
        # advertise when the operator enables the feature flag.
        if self.config.experimental.blackout_versions_feature_flag:
            unstable_features["io.blackout.product_fork"] = True

        return (
            200,
            {
                "versions": [
                    # Follow-up (matrix-org/synapse#17443, owner: client-server API
                    # team): legacy r0.* version advertizing remains for broad
                    # client compatibility; revisit removal policy when deprecation
                    # telemetry and cross-client impact is documented.
                    "r0.0.1",
                    "r0.1.0",
                    "r0.2.0",
                    "r0.3.0",
                    "r0.4.0",
                    "r0.5.0",
                    "r0.6.0",
                    "r0.6.1",
                    "v1.1",
                    "v1.2",
                    "v1.3",
                    "v1.4",
                    "v1.5",
                    "v1.6",
                    "v1.7",
                    "v1.8",
                    "v1.9",
                ],
                # as per MSC1497:
                "unstable_features": unstable_features,
            },
        )


def register_servlets(hs: "HomeServer", http_server: HttpServer) -> None:
    VersionsRestServlet(hs).register(http_server)
