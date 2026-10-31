"""Pins for the id_token claim checks that changed with authlib 1.9.1.

From 1.7.0 authlib validates registered id_token claims with joserfc, which
type-checks each one it finds. These tests pin the refusals that brought, so
a later authlib cannot loosen them unnoticed: an integer ``sub`` or ``jti``,
and an ``aud`` list holding a non-string. Upstream's test that used to feed an
integer ``sub`` through an id_token now feeds it through the userinfo endpoint
instead, so nothing else covers the id_token case.

Records: docs/security/dependency-advisories-server-desktop-2026-10-30.md
(repository root) and PATCHES.md, 2026-10-30.
"""

from __future__ import annotations

from typing import Any, Dict
from unittest.mock import AsyncMock, Mock

from twisted.test.proto_helpers import MemoryReactor

from synapse.server import HomeServer
from synapse.util import Clock
from synapse.util.stringutils import random_string

# Imported as a module, not as names: trial collects every TestCase class in
# this module's namespace, and that suite already runs on its own.
import tests.handlers.test_oidc as oidc_tests
from tests.test_utils.oidc import FakeOidcServer
from tests.unittest import HomeserverTestCase, override_config, skip_unless


@skip_unless(oidc_tests.HAS_OIDC, "requires OIDC")
class IdTokenClaimTypesTestCase(HomeserverTestCase):
    """An id_token whose registered claims have the wrong JSON type is refused.

    The harness is OidcHandlerTestCase's (tests/handlers/test_oidc.py), cut down.
    """

    def default_config(self) -> Dict[str, Any]:
        config = super().default_config()
        config["public_baseurl"] = oidc_tests.BASE_URL
        return config

    def make_homeserver(self, reactor: MemoryReactor, clock: Clock) -> HomeServer:
        self.fake_server = FakeOidcServer(clock=clock, issuer=oidc_tests.ISSUER)

        hs = self.setup_test_homeserver()
        self.hs_patcher = self.fake_server.patch_homeserver(hs=hs)
        self.hs_patcher.start()  # type: ignore[attr-defined]

        self.handler = hs.get_oidc_handler()
        self.provider = self.handler._providers["oidc"]

        self.render_error = Mock(return_value=None)
        hs.get_sso_handler().render_error = self.render_error  # type: ignore[method-assign]
        self.complete_sso_login = AsyncMock()
        hs.get_auth_handler().complete_sso_login = self.complete_sso_login  # type: ignore[method-assign]
        return hs

    def tearDown(self) -> None:
        self.hs_patcher.stop()  # type: ignore[attr-defined]
        return super().tearDown()

    def _callback(self, userinfo: Dict[str, Any], overrides: Dict[str, Any]) -> None:
        """Runs one authorization code flow; the id_token carries `overrides`."""
        from synapse.handlers.oidc import OidcSessionData

        nonce = random_string(10)
        state = random_string(10)
        code, _ = self.fake_server.start_authorization(
            userinfo=userinfo,
            scope="openid",
            client_id=self.provider._client_auth.client_id,
            redirect_uri=self.provider._callback_url,
            nonce=nonce,
            with_sid=False,
        )
        session = self.handler._macaroon_generator.generate_oidc_session_token(
            state=state,
            session_data=OidcSessionData(
                idp_id=self.provider.idp_id,
                nonce=nonce,
                client_redirect_url="http://client/redirect",
                ui_auth_session_id="",
                code_verifier="",
            ),
        )
        request = oidc_tests._build_callback_request(code, state, session)
        with self.fake_server.id_token_override(overrides):
            self.get_success(self.handler.handle_oidc_callback(request))

    def _assert_refused(
        self, userinfo: Dict[str, Any], overrides: Dict[str, Any]
    ) -> None:
        self._callback(userinfo, overrides)
        self.render_error.assert_called_once()
        self.assertEqual(self.render_error.call_args[0][1], "invalid_token")
        self.complete_sso_login.assert_not_called()

    def _assert_accepted(
        self, userinfo: Dict[str, Any], overrides: Dict[str, Any]
    ) -> None:
        self._callback(userinfo, overrides)
        self.render_error.assert_not_called()
        self.complete_sso_login.assert_called_once()

    @override_config({"oidc_config": oidc_tests.DEFAULT_CONFIG})
    def test_integer_sub_in_id_token_is_refused(self) -> None:
        """RFC 7519 makes `sub` a StringOrURI, so an integer one is refused."""
        self._assert_refused({"sub": 1234, "username": "int_sub"}, {})

    @override_config({"oidc_config": oidc_tests.DEFAULT_CONFIG})
    def test_integer_jti_in_id_token_is_refused(self) -> None:
        self._assert_refused({"sub": "int_jti", "username": "int_jti"}, {"jti": 5})

    @override_config({"oidc_config": oidc_tests.DEFAULT_CONFIG})
    def test_string_jti_in_id_token_is_accepted(self) -> None:
        """The control for the case above: the override itself is harmless."""
        self._assert_accepted(
            {"sub": "str_jti", "username": "str_jti"}, {"jti": "a-string-jti"}
        )

    @override_config({"oidc_config": oidc_tests.DEFAULT_CONFIG})
    def test_non_string_aud_member_is_refused(self) -> None:
        """Refused even though `azp` names this client, which alone used to pass."""
        self._assert_refused(
            {"sub": "aud_member", "username": "aud_member"},
            {"aud": [oidc_tests.CLIENT_ID, 5], "azp": oidc_tests.CLIENT_ID},
        )
