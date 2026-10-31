"""The back-channel logout endpoint refuses unsigned (``alg: none``) logout tokens.

OIDC Back-Channel Logout 1.0 sec. 2.6 step 2 forbids ``none`` for logout
tokens, but a provider may list it in ``id_token_signing_alg_values_supported``
for ID tokens, and that list is what the logout token is checked against. The
fork drops ``none`` from it in ``OidcProvider.handle_backchannel_logout``.

A logout token whose key authlib cannot use (a kid the JWKS does not have, or
an HS* header naming the provider's EC key) raises ValueError rather than
JoseError. The fork answers that with 400, as sec. 2.8 asks, where it used to
escape as a 500.

Records: docs/security/dependency-advisories-server-desktop-2026-10-30.md
(repository root) and PATCHES.md, 2026-10-30.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
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

    def _logout_claims(
        self, server: FakeOidcServer, grant: FakeAuthorizationGrant
    ) -> Dict[str, Any]:
        return {
            "iss": server.issuer,
            "aud": grant.client_id,
            "iat": int(self.clock.time()),
            "jti": "forged-logout-token",
            "events": {BACKCHANNEL_LOGOUT_EVENT: {}},
            "sid": grant.sid,
            "sub": grant.userinfo["sub"],
        }

    def _forged_logout_token(
        self, server: FakeOidcServer, grant: FakeAuthorizationGrant, alg: str, kid: str
    ) -> str:
        """A logout token that is not signed with any key the provider has.

        For HS256 the signature is an HMAC with a made-up secret; for any
        other alg it is 64 zero bytes. authlib fails on the key before it
        compares a signature.
        """
        signing_input = (
            f"{_b64url_json({'alg': alg, 'kid': kid})}."
            f"{_b64url_json(self._logout_claims(server, grant))}"
        )
        if alg == "HS256":
            signature = hmac.new(
                b"guessed-key", signing_input.encode("ascii"), hashlib.sha256
            ).digest()
        else:
            signature = b"\x00" * 64
        encoded = base64.urlsafe_b64encode(signature).rstrip(b"=").decode("ascii")
        return f"{signing_input}.{encoded}"

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
    def test_logout_token_with_unusable_key_is_refused_with_400(self) -> None:
        """A key authlib cannot use is a 400, not a 500, and ends no session."""
        server = self.helper.fake_oidc_server()
        with self._advertise(server, ["ES256", "HS256"]):
            login_resp, grant = self.helper.login_via_oidc(
                server, "john", with_sid=True
            )
            access_token: str = login_resp["access_token"]
            kid = server.get_jwks()["keys"][0]["kid"]

            with server.patch_homeserver(hs=self.hs):
                for alg, token_kid in (
                    # The provider's kid is an EC key, which has no "k".
                    ("HS256", kid),
                    ("HS256", "no-such-kid"),
                    ("ES256", "no-such-kid"),
                ):
                    with self.subTest(alg=alg, kid=token_kid):
                        channel = self._submit(
                            self._forged_logout_token(server, grant, alg, token_kid)
                        )
                        self.assertEqual(
                            channel.code, HTTPStatus.BAD_REQUEST, channel.result
                        )
                        self.assertEqual(self._whoami(access_token), HTTPStatus.OK)

            # The session still ends on a signed logout token.
            channel = self._submit(server.generate_logout_token(grant))
            self.assertEqual(channel.code, HTTPStatus.OK, channel.result)
            self.assertEqual(self._whoami(access_token), HTTPStatus.UNAUTHORIZED)
