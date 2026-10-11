"""End-to-end tests for panel session lengths (launch-plan step B3).

Every test talks to a real homeserver through its HTTP API, with the
blackout_runtime module loaded the way a deployment loads it. "After the
session ends" is reached by advancing the test reactor's clock, so the client
side's own timer plays no part: these tests are the server cutting a session
off on its own.
"""

from __future__ import annotations

import json
import os
import tempfile
from typing import Any, Dict, List, Optional, Tuple

from twisted.test.proto_helpers import MemoryReactor

from blackout_runtime.module import BlackoutRuntimeModule
from blackout_runtime.session_length import (
    ALREADY_SET_ERRCODE,
    SESSION_LENGTH_ORDER,
    SESSION_LENGTHS_MS,
    TABLE,
    delegated_auth_enabled,
    parse_session_length_body,
    session_lengths_requested,
    sweep_interval_ms,
)
from synapse.api.errors import SynapseError
from synapse.rest import admin
from synapse.rest.client import account, devices, keys, login, logout, pusher
from synapse.server import HomeServer
from synapse.types import create_requester
from synapse.util import Clock

from tests.unittest import HomeserverTestCase, override_config

LENGTH_PATH = "/_synapse/client/blackout/session/length"
LENGTHS_PATH = "/_synapse/client/blackout/session/lengths"
WHOAMI_PATH = "/_matrix/client/v3/account/whoami"
SWEEP_S = 60


class _ModuleTestCase(HomeserverTestCase):
    servlets = [
        admin.register_servlets,
        account.register_servlets,
        devices.register_servlets,
        keys.register_servlets,
        login.register_servlets,
        logout.register_servlets,
        pusher.register_servlets,
    ]

    module_config: Dict[str, Any] = {}

    def create_resource_dict(self) -> Dict[str, Any]:
        self._tmpdir = tempfile.mkdtemp(prefix="blackout-session-length-")
        config = {"persistence_path": os.path.join(self._tmpdir, "runtime.sqlite3")}
        config.update(self.module_config)
        self.module = BlackoutRuntimeModule(config, self.hs.get_module_api())
        resources = super().create_resource_dict()
        resources.update(self.hs._module_web_resources)
        return resources

    def prepare(self, reactor: MemoryReactor, clock: Clock, hs: HomeServer) -> None:
        self.store = hs.get_datastores().main
        self.user_id = self.register_user("alice", "pass")
        self.tok = self.login("alice", "pass")
        self.device_id = self._device_of(self.tok)

    def _device_of(self, tok: str) -> str:
        info = self.get_success(self.store.get_user_by_access_token(tok))
        assert info is not None and info.device_id is not None
        return info.device_id

    def _bind(self, tok: Optional[str], body: Any, raw: Optional[bytes] = None) -> Any:
        return self.make_request(
            "POST",
            LENGTH_PATH,
            raw if raw is not None else json.dumps(body).encode("utf-8"),
            access_token=tok,
        )

    def _whoami(self, tok: str) -> Any:
        return self.make_request("GET", WHOAMI_PATH, access_token=tok)

    def _rows(self) -> List[Tuple[str, str, str, Optional[int]]]:
        service = self.module._session_lengths
        if service is not None:
            self.get_success(service._store.ensure_schema())

        def _txn(txn: Any) -> List[Tuple[str, str, str, Optional[int]]]:
            txn.execute(
                f"SELECT user_id, device_id, session_length, expires_ts FROM {TABLE}"
            )
            return [tuple(row) for row in txn.fetchall()]  # type: ignore[misc]

        return self.get_success(self.store.db_pool.runInteraction("rows", _txn))

    def _pause_sweep(self) -> None:
        """Keep the scheduled sweep from finding anything, so a test sees what
        the token caps alone do before any device is deleted."""
        service = self.module._session_lengths
        assert service is not None
        store = service._store

        async def _nothing(**kwargs: Any) -> List[Tuple[str, str]]:
            return []

        self._real_expired = store.expired
        store.expired = _nothing  # type: ignore[method-assign]

    def _resume_sweep(self) -> None:
        service = self.module._session_lengths
        assert service is not None
        service._store.expired = self._real_expired  # type: ignore[method-assign]

    def _count(self, sql: str, *args: Any) -> int:
        def _txn(txn: Any) -> int:
            txn.execute(sql, args)
            return int(txn.fetchone()[0])

        return self.get_success(self.store.db_pool.runInteraction("count", _txn))


class SessionLengthDisabledTestCase(_ModuleTestCase):
    """Off by default: nothing is mounted, so the paths stay plain 404s."""

    def test_paths_are_absent_when_not_enabled(self) -> None:
        self.assertEqual(self.make_request("GET", LENGTHS_PATH).code, 404)
        self.assertEqual(self._bind(self.tok, {"session_length": "1h"}).code, 404)
        self.assertEqual(
            self.make_request("GET", LENGTH_PATH, access_token=self.tok).code, 404
        )
        # And a token is untouched: no expiry appears on it.
        self.reactor.advance(40 * 24 * 3600)
        self.assertEqual(self._whoami(self.tok).code, 200)

    def test_string_false_does_not_enable_it(self) -> None:
        self.assertFalse(session_lengths_requested({"session_lengths_enabled": "true"}))
        self.assertFalse(session_lengths_requested({"session_lengths_enabled": 1}))
        self.assertFalse(session_lengths_requested({}))
        self.assertTrue(session_lengths_requested({"session_lengths_enabled": True}))


class SessionLengthTestCase(_ModuleTestCase):
    module_config = {
        "session_lengths_enabled": True,
        "session_length_sweep_interval_s": SWEEP_S,
    }

    def test_lengths_lists_exactly_the_allowed_set(self) -> None:
        channel = self.make_request("GET", LENGTHS_PATH)
        self.assertEqual(channel.code, 200, channel.result)
        self.assertEqual(
            channel.json_body["session_lengths"],
            ["1h", "1d", "7d", "30d", "until_sign_out"],
        )
        self.assertEqual(
            list(SESSION_LENGTH_ORDER), channel.json_body["session_lengths"]
        )

    def test_binding_requires_an_access_token(self) -> None:
        channel = self._bind(None, {"session_length": "1h"})
        self.assertEqual(channel.code, 401, channel.result)
        self.assertEqual(self._rows(), [])

    def test_invalid_lengths_are_rejected_with_400_and_change_nothing(self) -> None:
        bodies: List[Any] = [
            {"session_length": "2h"},
            {"session_length": "1H"},
            {"session_length": " 1h"},
            {"session_length": "1h "},
            {"session_length": ""},
            {"session_length": "forever"},
            {"session_length": "until sign out"},
            {"session_length": 3600},
            {"session_length": 3600000},
            {"session_length": None},
            {"session_length": True},
            {"session_length": ["1h"]},
            {"session_length": {"value": "1h"}},
            {},
            {"session_length": "1h", "expires_at_ms": 9_999_999_999_999},
            {"length": "1h"},
            ["1h"],
            "1h",
            3600,
        ]
        raw_bodies = [b"", b"{", b"not json", b"\xff\xfe"]
        for body in bodies:
            channel = self._bind(self.tok, body)
            self.assertEqual(channel.code, 400, (body, channel.result))
        for raw in raw_bodies:
            channel = self._bind(self.tok, None, raw=raw)
            self.assertEqual(channel.code, 400, (raw, channel.result))

        self.assertEqual(self._rows(), [])
        info = self.get_success(self.store.get_user_by_access_token(self.tok))
        assert info is not None
        self.assertIsNone(info.valid_until_ms)
        self.reactor.advance(40 * 24 * 3600)
        self.assertEqual(self._whoami(self.tok).code, 200)

    def test_parse_accepts_only_the_exact_set(self) -> None:
        for value in SESSION_LENGTHS_MS:
            raw = json.dumps({"session_length": value}).encode()
            self.assertEqual(parse_session_length_body(raw), value)
        with self.assertRaises(SynapseError):
            parse_session_length_body(b'{"session_length": "60m"}')

    def test_an_hour_long_session_is_refused_after_the_hour(self) -> None:
        # The token caps alone must refuse the session; the device sweep is
        # tested separately, so keep it out of the way here.
        self._pause_sweep()
        # Use the token first, so its lookup (with no expiry) sits in Synapse's
        # cache: the bind has to invalidate it, not just write the row.
        self.assertEqual(self._whoami(self.tok).code, 200)

        before = self.clock.time_msec()
        channel = self._bind(self.tok, {"session_length": "1h"})
        after = self.clock.time_msec()
        self.assertEqual(channel.code, 200, channel.result)
        self.assertEqual(channel.json_body["session_length"], "1h")
        self.assertEqual(channel.json_body["device_id"], self.device_id)
        ends_at = channel.json_body["expires_at_ms"]
        self.assertGreaterEqual(ends_at, before + 3_600_000)
        self.assertLessEqual(ends_at, after + 3_600_000)

        described = self.make_request("GET", LENGTH_PATH, access_token=self.tok)
        self.assertEqual(described.code, 200, described.result)
        self.assertEqual(described.json_body["session_length"], "1h")
        self.assertEqual(described.json_body["expires_at_ms"], ends_at)

        # One second before the end: still a working session.
        self.reactor.advance((ends_at - self.clock.time_msec()) / 1000 - 1)
        self.assertEqual(self._whoami(self.tok).code, 200)

        # Past the end: refused, and refused again however often it is shown,
        # on every authenticated endpoint.
        self.reactor.advance(2)
        for _ in range(3):
            channel = self._whoami(self.tok)
            self.assertEqual(channel.code, 401, channel.result)
            self.assertEqual(channel.json_body["errcode"], "M_UNKNOWN_TOKEN")
            self.assertTrue(channel.json_body.get("soft_logout"))
        self.assertEqual(
            self.make_request(
                "GET", "/_matrix/client/v3/devices", access_token=self.tok
            ).code,
            401,
        )
        self.assertEqual(
            self.make_request("GET", LENGTH_PATH, access_token=self.tok).code, 401
        )
        # An ended session cannot rebind itself to a fresh length either.
        self.assertEqual(self._bind(self.tok, {"session_length": "30d"}).code, 401)

    def test_the_sweep_signs_the_device_out(self) -> None:
        pusher_set = self.make_request(
            "POST",
            "/_matrix/client/v3/pushers/set",
            {
                "kind": "http",
                "app_id": "m.http",
                "app_display_name": "HTTP Push Notifications",
                "device_display_name": "panel",
                "pushkey": "a@example.com",
                "lang": "en",
                "data": {"url": "http://example.com/_matrix/push/v1/notify"},
            },
            access_token=self.tok,
        )
        self.assertEqual(pusher_set.code, 200, pusher_set.result)
        keys_up = self.make_request(
            "POST",
            "/_matrix/client/v3/keys/upload",
            {"one_time_keys": {"alg1:k1": "key1"}},
            access_token=self.tok,
        )
        self.assertEqual(keys_up.code, 200, keys_up.result)
        self.assertEqual(self._bind(self.tok, {"session_length": "1h"}).code, 200)

        pushers = list(
            self.get_success(self.store.get_pushers_by_user_id(self.user_id))
        )
        self.assertEqual(len(pushers), 1)

        self.reactor.advance(3600 + 1)
        self.reactor.advance(SWEEP_S + 1)

        self.assertIsNone(
            self.get_success(self.store.get_device(self.user_id, self.device_id))
        )
        self.assertEqual(
            self._count(
                "SELECT COUNT(*) FROM access_tokens WHERE user_id = ? AND device_id = ?",
                self.user_id,
                self.device_id,
            ),
            0,
        )
        self.assertEqual(
            list(self.get_success(self.store.get_pushers_by_user_id(self.user_id))), []
        )
        otks = self.get_success(
            self.store.count_e2e_one_time_keys(self.user_id, self.device_id)
        )
        self.assertEqual(sum(otks.values()), 0)
        self.assertEqual(self._rows(), [])

        # The old token is now simply unknown, however often it is presented.
        for _ in range(2):
            channel = self._whoami(self.tok)
            self.assertEqual(channel.code, 401, channel.result)
            self.assertEqual(channel.json_body["errcode"], "M_UNKNOWN_TOKEN")

    def test_the_length_is_set_once_and_never_replaced(self) -> None:
        first = self._bind(self.tok, {"session_length": "1d"})
        self.assertEqual(first.code, 200, first.result)
        for value in ("1h", "30d", "until_sign_out", "1d"):
            again = self._bind(self.tok, {"session_length": value})
            self.assertEqual(again.code, 409, again.result)
            self.assertEqual(again.json_body["errcode"], ALREADY_SET_ERRCODE)
        self.assertEqual(
            [(r[2], r[3]) for r in self._rows()],
            [("1d", first.json_body["expires_at_ms"])],
        )
        self.reactor.advance(24 * 3600 + 1)
        self.assertEqual(self._whoami(self.tok).code, 401)

    def test_until_sign_out_adds_no_expiry(self) -> None:
        channel = self._bind(self.tok, {"session_length": "until_sign_out"})
        self.assertEqual(channel.code, 200, channel.result)
        self.assertIsNone(channel.json_body["expires_at_ms"])
        info = self.get_success(self.store.get_user_by_access_token(self.tok))
        assert info is not None
        self.assertIsNone(info.valid_until_ms)

        self.reactor.advance(40 * 24 * 3600)
        self.assertEqual(self._whoami(self.tok).code, 200)
        self.assertIsNotNone(
            self.get_success(self.store.get_device(self.user_id, self.device_id))
        )
        self.assertEqual(len(self._rows()), 1)

    def test_other_sessions_of_the_same_user_are_untouched(self) -> None:
        other_tok = self.login("alice", "pass")
        other_device = self._device_of(other_tok)
        self.assertNotEqual(other_device, self.device_id)
        self.assertEqual(self._bind(self.tok, {"session_length": "1h"}).code, 200)

        self.reactor.advance(3600 + SWEEP_S + 2)

        self.assertEqual(self._whoami(self.tok).code, 401)
        self.assertEqual(self._whoami(other_tok).code, 200)
        self.assertIsNotNone(
            self.get_success(self.store.get_device(self.user_id, other_device))
        )

    def test_logout_forgets_the_length(self) -> None:
        self.assertEqual(self._bind(self.tok, {"session_length": "7d"}).code, 200)
        self.assertEqual(len(self._rows()), 1)
        out = self.make_request(
            "POST", "/_matrix/client/v3/logout", access_token=self.tok
        )
        self.assertEqual(out.code, 200, out.result)
        self.assertEqual(self._rows(), [])

    def test_a_puppet_token_without_a_device_is_refused(self) -> None:
        self.register_user("admin", "pass", admin=True)
        admin_tok = self.login("admin", "pass")
        puppet = self.make_request(
            "POST",
            f"/_synapse/admin/v1/users/{self.user_id}/login",
            {},
            access_token=admin_tok,
        )
        self.assertEqual(puppet.code, 200, puppet.result)
        channel = self._bind(puppet.json_body["access_token"], {"session_length": "1h"})
        self.assertEqual(channel.code, 403, channel.result)
        self.assertEqual(self._rows(), [])

    def test_only_the_users_own_device_may_set_a_length(self) -> None:
        # Puppet tokens from the admin API carry no device (refused above);
        # this pins the rule for any token whose authenticated entity is not
        # the user it acts as, even if it names one of the user's devices.
        service = self.module._session_lengths
        assert service is not None
        refused = [
            create_requester(
                self.user_id,
                device_id=self.device_id,
                authenticated_entity="@admin:test",
            ),
            create_requester(self.user_id, device_id=None),
            create_requester(self.user_id, device_id=self.device_id, is_guest=True),
        ]
        for requester in refused:
            failure = self.get_failure(service.bind(requester, "1h"), SynapseError)
            self.assertEqual(failure.value.code, 403)
        self.assertEqual(self._rows(), [])
        allowed = create_requester(self.user_id, device_id=self.device_id)
        self.assertEqual(
            self.get_success(service.bind(allowed, "1h"))["device_id"], self.device_id
        )

    def test_described_length_is_null_for_an_unbound_device(self) -> None:
        channel = self.make_request("GET", LENGTH_PATH, access_token=self.tok)
        self.assertEqual(channel.code, 200, channel.result)
        self.assertEqual(
            channel.json_body,
            {
                "device_id": self.device_id,
                "session_length": None,
                "expires_at_ms": None,
            },
        )


class SessionLengthRefreshTokenTestCase(_ModuleTestCase):
    """With refresh tokens on, the session end bounds /refresh too."""

    module_config = {
        "session_lengths_enabled": True,
        "session_length_sweep_interval_s": SWEEP_S,
    }

    def _login_refreshable(self) -> Dict[str, Any]:
        channel = self.make_request(
            "POST",
            "/_matrix/client/v3/login",
            {
                "type": "m.login.password",
                "identifier": {"type": "m.id.user", "user": "alice"},
                "password": "pass",
                "refresh_token": True,
            },
        )
        self.assertEqual(channel.code, 200, channel.result)
        self.assertIn("refresh_token", channel.json_body)
        return channel.json_body

    def _refresh(self, refresh_token: str) -> Any:
        return self.make_request(
            "POST", "/_matrix/client/v3/refresh", {"refresh_token": refresh_token}
        )

    @override_config(
        {"refreshable_access_token_lifetime": "5m", "refresh_token_lifetime": "1d"}
    )
    def test_refresh_is_capped_and_then_refused(self) -> None:
        self._pause_sweep()
        session = self._login_refreshable()
        access, refresh = session["access_token"], session["refresh_token"]
        bound = self._bind(access, {"session_length": "1h"})
        self.assertEqual(bound.code, 200, bound.result)
        ends_at = bound.json_body["expires_at_ms"]

        # Keep refreshing like a client would; every new access token is
        # capped at the session end however late in the hour it is minted.
        while ends_at - self.clock.time_msec() > 6 * 60 * 1000:
            self.reactor.advance(5 * 60)
            asked_at = self.clock.time_msec()
            channel = self._refresh(refresh)
            self.assertEqual(channel.code, 200, channel.result)
            access, refresh = (
                channel.json_body["access_token"],
                channel.json_body["refresh_token"],
            )
            # expires_in_ms counts from when the server handled the request,
            # which is no earlier than asked_at.
            self.assertLessEqual(channel.json_body["expires_in_ms"], ends_at - asked_at)
            # Use the new access token so the refresh chain moves on.
            self.assertEqual(self._whoami(access).code, 200)

        # A minute before the end: the next token gets at most that minute,
        # although the server's refreshable lifetime is five.
        self.reactor.advance((ends_at - self.clock.time_msec()) / 1000 - 60)
        channel = self._refresh(refresh)
        self.assertEqual(channel.code, 200, channel.result)
        self.assertLessEqual(channel.json_body["expires_in_ms"], 60_000)
        access, refresh = (
            channel.json_body["access_token"],
            channel.json_body["refresh_token"],
        )
        self.assertEqual(self._whoami(access).code, 200)

        # Past the end, before any sweep: the refresh token is refused and so
        # is the access token, however often either is presented.
        self.reactor.advance(61)
        for _ in range(2):
            refused = self._refresh(refresh)
            self.assertEqual(refused.code, 403, refused.result)
            whoami = self._whoami(access)
            self.assertEqual(whoami.code, 401, whoami.result)
            self.assertTrue(whoami.json_body.get("soft_logout"))

        # After the sweep the device and its refresh tokens are gone outright.
        self._resume_sweep()
        self.reactor.advance(SWEEP_S + 1)
        gone = self._refresh(refresh)
        self.assertEqual(gone.code, 401, gone.result)
        self.assertEqual(gone.json_body["errcode"], "M_UNKNOWN_TOKEN")
        self.assertEqual(
            self._count(
                "SELECT COUNT(*) FROM refresh_tokens WHERE user_id = ?", self.user_id
            ),
            0,
        )

    @override_config({"refreshable_access_token_lifetime": "5m"})
    def test_the_bind_caps_the_refresh_token_it_finds(self) -> None:
        session = self._login_refreshable()
        bound = self._bind(session["access_token"], {"session_length": "1h"})
        self.assertEqual(bound.code, 200, bound.result)
        ends_at = bound.json_body["expires_at_ms"]
        rows = self.get_success(
            self.store.db_pool.simple_select_list(
                "refresh_tokens",
                {"user_id": self.user_id},
                ["expiry_ts", "ultimate_session_expiry_ts"],
            )
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(tuple(rows[0]), (ends_at, ends_at))
        info = self.get_success(
            self.store.get_user_by_access_token(session["access_token"])
        )
        assert info is not None
        # The access token from login already expired sooner (5 minutes), so
        # the bind leaves that shorter expiry alone rather than lengthening it.
        assert info.valid_until_ms is not None
        self.assertLess(info.valid_until_ms, ends_at)


class SessionLengthConfigTestCase(HomeserverTestCase):
    """The pieces of config handling that need no homeserver."""

    def test_sweep_interval_is_clamped(self) -> None:
        self.assertEqual(sweep_interval_ms({}), 60_000)
        self.assertEqual(
            sweep_interval_ms({"session_length_sweep_interval_s": 1}), 5_000
        )
        self.assertEqual(
            sweep_interval_ms({"session_length_sweep_interval_s": 10**9}), 3_600_000
        )
        self.assertEqual(
            sweep_interval_ms({"session_length_sweep_interval_s": "30"}), 60_000
        )
        self.assertEqual(
            sweep_interval_ms({"session_length_sweep_interval_s": True}), 60_000
        )

    def test_delegated_auth_turns_it_off(self) -> None:
        class _Msc3861:
            enabled = True

        class _Experimental:
            msc3861 = _Msc3861()

        class _Config:
            experimental = _Experimental()

        class _Hs:
            config = _Config()

        self.assertTrue(delegated_auth_enabled(_Hs()))
        self.assertFalse(delegated_auth_enabled(self.hs))
        self.assertFalse(delegated_auth_enabled(None))
