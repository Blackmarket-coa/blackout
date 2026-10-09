#
# Regression tests for GHSA-95fh-hv8c-chvq, ported by hand into the Blackout
# fork (see apps/blackout-server/PATCHES.md and
# docs/security/upstream-advisory-triage-2026-10-09.md).
#
# Upstream's regression test drives the error through a room policy server,
# which this 1.98-based tree does not have. These tests exercise the same
# conversion directly and through a path this tree does have: inviting a user
# on a remote (malicious) homeserver, whose error is relayed to the client.
#
import json
from http import HTTPStatus
from unittest.mock import AsyncMock, Mock

from twisted.test.proto_helpers import MemoryReactor

from synapse.api.errors import Codes, HttpResponseException
from synapse.rest import admin
from synapse.rest.client import login, room
from synapse.server import HomeServer
from synapse.util import Clock

from tests import unittest


def _http_error(code: int, errcode: str, error: str) -> HttpResponseException:
    return HttpResponseException(
        code,
        "upstream error",
        json.dumps({"errcode": errcode, "error": error}).encode("utf-8"),
    )


class ToSynapseErrorTestCase(unittest.TestCase):
    def test_untrusted_unknown_token_is_rewritten(self) -> None:
        """A remote 401 / M_UNKNOWN_TOKEN must not reach the client as such."""
        err = _http_error(
            HTTPStatus.UNAUTHORIZED, Codes.UNKNOWN_TOKEN, "unknown token"
        ).to_synapse_error()
        self.assertEqual(err.code, HTTPStatus.BAD_REQUEST)
        self.assertEqual(err.errcode, Codes.UNKNOWN)
        self.assertEqual(err.msg, "unknown token")

    def test_untrusted_unknown_token_with_other_status_is_rewritten(self) -> None:
        err = _http_error(
            HTTPStatus.FORBIDDEN, Codes.UNKNOWN_TOKEN, "unknown token"
        ).to_synapse_error()
        self.assertEqual(err.code, HTTPStatus.FORBIDDEN)
        self.assertEqual(err.errcode, Codes.UNKNOWN)

    def test_untrusted_401_with_other_errcode_is_rewritten(self) -> None:
        err = _http_error(
            HTTPStatus.UNAUTHORIZED, Codes.MISSING_TOKEN, "missing"
        ).to_synapse_error()
        self.assertEqual(err.code, HTTPStatus.BAD_REQUEST)
        self.assertEqual(err.errcode, Codes.MISSING_TOKEN)

    def test_untrusted_other_errors_pass_through(self) -> None:
        err = _http_error(
            HTTPStatus.IM_A_TEAPOT, Codes.FORBIDDEN, "No coffee here"
        ).to_synapse_error()
        self.assertEqual(err.code, HTTPStatus.IM_A_TEAPOT)
        self.assertEqual(err.errcode, Codes.FORBIDDEN)
        self.assertEqual(err.msg, "No coffee here")

    def test_non_string_errcode_and_error(self) -> None:
        exc = HttpResponseException(
            HTTPStatus.BAD_REQUEST,
            "upstream error",
            json.dumps({"errcode": 42, "error": {"nested": True}}).encode("utf-8"),
        )
        for err in (exc.to_synapse_error(), exc.unsafe_to_verbatim_synapse_error()):
            self.assertEqual(err.errcode, Codes.UNKNOWN)
            self.assertEqual(err.msg, "upstream error")

    def test_trusted_worker_errors_are_verbatim(self) -> None:
        """Errors from our own workers are still relayed unchanged."""
        err = _http_error(
            HTTPStatus.UNAUTHORIZED, Codes.UNKNOWN_TOKEN, "unknown token"
        ).unsafe_to_verbatim_synapse_error()
        self.assertEqual(err.code, HTTPStatus.UNAUTHORIZED)
        self.assertEqual(err.errcode, Codes.UNKNOWN_TOKEN)


class RemoteInviteErrorRelayTestCase(unittest.HomeserverTestCase):
    """A malicious remote server must not be able to log a client out."""

    servlets = [
        admin.register_servlets,
        login.register_servlets,
        room.register_servlets,
    ]

    def make_homeserver(self, reactor: MemoryReactor, clock: Clock) -> HomeServer:
        # Nothing in these tests may reach the network.
        self.fed_http_client = Mock()
        return self.setup_test_homeserver(federation_http_client=self.fed_http_client)

    def prepare(self, reactor: MemoryReactor, clock: Clock, hs: HomeServer) -> None:
        self.user_id = self.register_user("alice", "pass")
        self.tok = self.login("alice", "pass")
        self.room_id = self.helper.create_room_as(self.user_id, tok=self.tok)

    def _invite_remote_user_with_remote_error(
        self, status: int, errcode: str
    ) -> "unittest.FakeChannel":
        transport = self.hs.get_federation_client().transport_layer
        transport.send_invite_v2 = AsyncMock(  # type: ignore[method-assign]
            side_effect=_http_error(status, errcode, "remote said no")
        )
        channel = self.make_request(
            "POST",
            f"/_matrix/client/r0/rooms/{self.room_id}/invite",
            {"user_id": "@bob:evil.example"},
            access_token=self.tok,
        )
        # Sentinel: the request really went to the (mocked) remote server.
        transport.send_invite_v2.assert_called_once()
        return channel

    def test_remote_unknown_token_does_not_reach_client(self) -> None:
        channel = self._invite_remote_user_with_remote_error(
            HTTPStatus.UNAUTHORIZED, Codes.UNKNOWN_TOKEN
        )
        self.assertEqual(channel.code, HTTPStatus.BAD_REQUEST, channel.json_body)
        self.assertEqual(channel.json_body["errcode"], Codes.UNKNOWN)

    def test_remote_forbidden_still_relayed(self) -> None:
        channel = self._invite_remote_user_with_remote_error(
            HTTPStatus.FORBIDDEN, Codes.FORBIDDEN
        )
        self.assertEqual(channel.code, HTTPStatus.FORBIDDEN, channel.json_body)
        self.assertEqual(channel.json_body["errcode"], Codes.FORBIDDEN)
