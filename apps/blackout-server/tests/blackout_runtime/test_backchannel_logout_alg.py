"""The back-channel logout endpoint refuses unsigned (``alg: none``) logout tokens.

OIDC Back-Channel Logout 1.0 sec. 2.6 step 2 forbids ``none`` for logout
tokens, but a provider may list it in ``id_token_signing_alg_values_supported``
for ID tokens, and that list is what the logout token is checked against. The
fork drops ``none`` from it in ``OidcProvider.handle_backchannel_logout``.

Records: docs/security/dependency-advisories-server-desktop-2026-10-30.md
(repository root) and PATCHES.md, 2026-10-30.
"""

from __future__ import annotations

import base64
import json
from http import HTTPStatus
from typing import Any, ContextManager, Dict, List
from unittest.mock import Mock, patch

from twisted.test.proto_helpers import MemoryReactor
from twisted.web.resource import Resource

from synapse.rest.client import account, login
from synapse.rest.synapse.client import build_synapse_client_resource_tree
from synapse.server import HomeServer
from synapse.util import Clock

# Imported as modules, not as names: trial collects every TestCase class in
# this module's namespace, and those suites already run on their own.
import tests.handlers.test_oidc as oidc_tests
import tests.rest.client.test_auth as auth_tests
from tests.server import FakeChannel
from tests.test_utils.oidc import FakeAuthorizationGrant, FakeOidcServer
from tests.unittest import HomeserverTestCase, override_config, skip_unless

BACKCHANNEL_LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout"


def _b64url_json(value: Dict[str, Any]) -> str:
    raw = json.dumps(value).encode("utf-8")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


@skip_unless(oidc_tests.HAS_OIDC, "requires OIDC")
class UnsignedLogoutTokenTestCase(HomeserverTestCase):
    """The back-channel logout endpoint refuses an unsigned logout token."""

    servlets = [account.register_servlets, login.register_servlets]

    def default_config(self) -> Dict[str, Any]:
        config = super().default_config()
        # As in OidcBackchannelLogoutTests: FakeChannel is not secure.
        config["public_baseurl"] = "http://synapse.test"
        return config

    def make_homeserver(self, reactor: MemoryReactor, clock: Clock) -> HomeServer:
        return self.setup_test_homeserver()

    def create_resource_dict(self) -> Dict[str, Resource]:
        resource_dict = super().create_resource_dict()
        resource_dict.update(build_synapse_client_resource_tree(self.hs))
        return resource_dict

    def _advertise(
        self, server: FakeOidcServer, algs: List[str]
    ) -> ContextManager[Mock]:
        metadata = server.get_metadata()
        metadata["id_token_signing_alg_values_supported"] = algs
        return patch.object(server, "get_metadata", return_value=metadata)

    def _submit(self, logout_token: str) -> FakeChannel:
        return self.make_request(
            "POST",
            "/_synapse/client/oidc/backchannel_logout",
            content=f"logout_token={logout_token}",
            content_is_form=True,
        )

    def _whoami(self, access_token: str) -> int:
        channel = self.make_request(
            "GET", "/_matrix/client/v3/account/whoami", access_token=access_token
        )
        return channel.code

    def _unsigned_logout_token(
        self, server: FakeOidcServer, grant: FakeAuthorizationGrant
    ) -> str:
        now = int(self.clock.time())
        header = {"alg": "none", "kid": server.get_jwks()["keys"][0]["kid"]}
        claims = {
            "iss": server.issuer,
            "aud": grant.client_id,
            "iat": now,
            "jti": "unsigned-logout-token",
            "events": {BACKCHANNEL_LOGOUT_EVENT: {}},
            "sid": grant.sid,
            "sub": grant.userinfo["sub"],
        }
        return f"{_b64url_json(header)}.{_b64url_json(claims)}."

    @override_config(
        {
            "oidc_providers": [
                auth_tests.oidc_config(
                    id="oidc",
                    with_localpart_template=True,
                    backchannel_logout_enabled=True,
                )
            ]
        }
    )
    def test_unsigned_logout_token_is_refused_when_none_is_advertised(self) -> None:
        server = self.helper.fake_oidc_server()
        with self._advertise(server, ["ES256", "none"]):
            login_resp, grant = self.helper.login_via_oidc(
                server, "john", with_sid=True
            )
            access_token: str = login_resp["access_token"]
            self.assertEqual(self._whoami(access_token), HTTPStatus.OK)

            channel = self._submit(self._unsigned_logout_token(server, grant))
            self.assertEqual(channel.code, HTTPStatus.BAD_REQUEST, channel.result)
            self.assertEqual(self._whoami(access_token), HTTPStatus.OK)

            # The same session still ends on a signed logout token, so the
            # refusal above is the signature rule and not a broken setup.
            channel = self._submit(server.generate_logout_token(grant))
            self.assertEqual(channel.code, HTTPStatus.OK, channel.result)
            self.assertEqual(self._whoami(access_token), HTTPStatus.UNAUTHORIZED)

    @override_config(
        {
            "oidc_providers": [
                auth_tests.oidc_config(
                    id="oidc",
                    with_localpart_template=True,
                    backchannel_logout_enabled=True,
                )
            ]
        }
    )
    def test_every_logout_token_is_refused_when_only_none_is_advertised(
        self,
    ) -> None:
        """Nothing is left once "none" is dropped, and that fails closed."""
        server = self.helper.fake_oidc_server()
        login_resp, grant = self.helper.login_via_oidc(server, "john", with_sid=True)
        access_token: str = login_resp["access_token"]

        with self._advertise(server, ["none"]):
            # The login cached the provider's metadata; reload it.
            provider = self.hs.get_oidc_handler()._providers["oidc"]
            with server.patch_homeserver(hs=self.hs):
                metadata = self.get_success(provider.load_metadata(force=True))
            self.assertEqual(
                metadata["id_token_signing_alg_values_supported"], ["none"]
            )

            for token in (
                self._unsigned_logout_token(server, grant),
                server.generate_logout_token(grant),
            ):
                channel = self._submit(token)
                self.assertEqual(channel.code, HTTPStatus.BAD_REQUEST, channel.result)
        self.assertEqual(self._whoami(access_token), HTTPStatus.OK)
