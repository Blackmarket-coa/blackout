#
# Regression test for GHSA-hgcg-p9gx-fq5f, ported by hand into the Blackout
# fork (see apps/blackout-server/PATCHES.md and
# docs/security/upstream-advisory-triage-2026-10-09.md).
#
# Upstream Synapse 1.157.2 anchored these servlet patterns with `$` so that
# trailing data appended to the path no longer reaches the servlet. A reverse
# proxy that routes on a normalised path could otherwise be bypassed. Upstream
# did not ship a test for this; this one checks every servlet we anchored.
#
from typing import Iterable, Pattern, Type, Union

from parameterized import parameterized

from synapse.http.servlet import RestServlet
from synapse.rest.admin.experimental_features import ExperimentalFeaturesRestServlet
from synapse.rest.admin.users import (
    AccountDataRestServlet,
    UserByExternalId,
    UserByThreePid,
    UserReplaceMasterCrossSigningKeyRestServlet,
)
from synapse.rest.client.account_data import (
    AccountDataServlet,
    RoomAccountDataServlet,
    UnstableAccountDataServlet,
    UnstableRoomAccountDataServlet,
)
from synapse.rest.client.appservice_ping import AppservicePingRestServlet
from synapse.rest.client.auth import AuthRestServlet
from synapse.rest.client.devices import DeleteDevicesRestServlet
from synapse.rest.client.filter import CreateFilterRestServlet, GetFilterRestServlet
from synapse.rest.client.knock import KnockRoomAliasServlet
from synapse.rest.client.login import CasTicketServlet
from synapse.rest.client.openid import IdTokenServlet
from synapse.rest.client.presence import PresenceStatusRestServlet
from synapse.rest.client.profile import (
    ProfileAvatarURLRestServlet,
    ProfileDisplaynameRestServlet,
    ProfileRestServlet,
)
from synapse.rest.client.register import (
    RegistrationTokenValidityRestServlet,
    UsernameAvailabilityRestServlet,
)
from synapse.rest.client.relations import ThreadsServlet
from synapse.rest.client.room import RoomAliasListServlet
from synapse.rest.client.tags import TagServlet
from synapse.rest.client.thirdparty import ThirdPartyProtocolsServlet
from synapse.rest.client.tokenrefresh import TokenRefreshRestServlet
from synapse.rest.media.create_resource import CreateResource

from tests import unittest

U = "@alice:test"
R = "!room:test"
C = "/_matrix/client/v3"
A = "/_synapse/admin/v1"

CASES = [
    (ExperimentalFeaturesRestServlet, f"{A}/experimental_features/{U}"),
    (AccountDataRestServlet, f"{A}/users/{U}/accountdata"),
    (
        UserReplaceMasterCrossSigningKeyRestServlet,
        f"{A}/users/{U}/_allow_cross_signing_replacement_without_uia",
    ),
    (UserByExternalId, f"{A}/auth_providers/oidc/users/ext"),
    (UserByThreePid, f"{A}/threepid/email/users/a@b.c"),
    (AccountDataServlet, f"{C}/user/{U}/account_data/m.type"),
    (
        UnstableAccountDataServlet,
        f"/_matrix/client/unstable/org.matrix.msc3391/user/{U}/account_data/m.type",
    ),
    (RoomAccountDataServlet, f"{C}/user/{U}/rooms/{R}/account_data/m.type"),
    (
        UnstableRoomAccountDataServlet,
        f"/_matrix/client/unstable/org.matrix.msc3391/user/{U}/rooms/{R}/account_data/m.type",
    ),
    (AppservicePingRestServlet, "/_matrix/client/v1/appservice/as1/ping"),
    (AuthRestServlet, f"{C}/auth/m.login.recaptcha/fallback/web"),
    (DeleteDevicesRestServlet, f"{C}/delete_devices"),
    (GetFilterRestServlet, f"{C}/user/{U}/filter/1"),
    (CreateFilterRestServlet, f"{C}/user/{U}/filter"),
    (KnockRoomAliasServlet, f"{C}/knock/{R}"),
    (CasTicketServlet, f"{C}/login/cas/ticket"),
    (IdTokenServlet, f"{C}/user/{U}/openid/request_token"),
    (PresenceStatusRestServlet, f"{C}/presence/{U}/status"),
    (ProfileDisplaynameRestServlet, f"{C}/profile/{U}/displayname"),
    (ProfileAvatarURLRestServlet, f"{C}/profile/{U}/avatar_url"),
    (ProfileRestServlet, f"{C}/profile/{U}"),
    (UsernameAvailabilityRestServlet, f"{C}/register/available"),
    (
        RegistrationTokenValidityRestServlet,
        "/_matrix/client/v1/register/m.login.registration_token/validity",
    ),
    (ThreadsServlet, f"/_matrix/client/v1/rooms/{R}/threads"),
    (
        RoomAliasListServlet,
        f"/_matrix/client/unstable/org.matrix.msc2432/rooms/{R}/aliases",
    ),
    (RoomAliasListServlet, f"{C}/rooms/{R}/aliases"),
    (TagServlet, f"{C}/user/{U}/rooms/{R}/tags/u.work"),
    (ThirdPartyProtocolsServlet, f"{C}/thirdparty/protocols"),
    (TokenRefreshRestServlet, f"{C}/tokenrefresh"),
    (CreateResource, "/_matrix/media/v1/create"),
]


def _patterns(servlet: Type[RestServlet]) -> Iterable[Pattern]:
    patterns: Union[Iterable[Pattern], Pattern] = servlet.PATTERNS
    return list(patterns)


class PatternAnchoringTestCase(unittest.TestCase):
    @parameterized.expand(
        [(s.__name__ + "_" + str(i), s, p) for i, (s, p) in enumerate(CASES)]
    )
    def test_trailing_data_is_not_matched(
        self, _name: str, servlet: Type[RestServlet], path: str
    ) -> None:
        patterns = _patterns(servlet)
        # Sentinel: the canonical path is still served by this servlet.
        self.assertTrue(
            any(p.match(path) for p in patterns),
            f"{servlet.__name__} no longer matches its own path {path}",
        )
        for suffix in ("/extra", "/", "/../x"):
            self.assertFalse(
                any(p.match(path + suffix) for p in patterns),
                f"{servlet.__name__} still matches {path + suffix!r}",
            )
