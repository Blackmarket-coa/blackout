#
# Regression tests for upstream Synapse security advisories, ported by hand into
# the Blackout fork (see apps/blackout-server/PATCHES.md and
# docs/security/upstream-advisory-triage-2026-10-09.md).
#
# The tests are taken from upstream Synapse 1.157.2's
# tests/federation/test_federation_server.py and adapted to the 1.98-era test
# harness in this tree (no `RestHelper.send_messages`, `typing` generics).
#
# Upstream copyright: (C) 2026 Element Creations Ltd, AGPL-3.0-or-later.
#
from http import HTTPStatus
from typing import Dict, List, Set, Tuple

from parameterized import parameterized

from twisted.test.proto_helpers import MemoryReactor

from synapse.api.constants import EventTypes, Membership
from synapse.api.errors import Codes
from synapse.api.room_versions import RoomVersions
from synapse.events import make_event_from_dict
from synapse.rest import admin
from synapse.rest.client import login, room, sync
from synapse.server import HomeServer
from synapse.types import JsonDict
from synapse.util import Clock

from tests import unittest


def _send_messages(
    testcase: unittest.HomeserverTestCase, room_id: str, num_events: int, tok: str
) -> List[str]:
    """Stand-in for upstream's `RestHelper.send_messages`."""
    return [
        testcase.helper.send(room_id, body=f"Test event {idx}", tok=tok)["event_id"]
        for idx in range(num_events)
    ]


class GetMissingEventsRoomCheckTests(unittest.FederatingHomeserverTestCase):
    """
    Regression tests for room confusion in /get_missing_events
    https://github.com/element-hq/synapse/security/advisories/GHSA-27p5-4f45-gx76
    """

    servlets = [
        admin.register_servlets,
        login.register_servlets,
        room.register_servlets,
    ]

    def prepare(self, reactor: MemoryReactor, clock: Clock, hs: HomeServer) -> None:
        super().prepare(reactor, clock, hs)

        # Local user
        self.local_user_id = self.register_user("alice", "pass")
        self.local_user_token = self.login("alice", "pass")

        # Create 2 rooms (one with the remote server, one without).
        # - The remote server will be in this room
        self.room_allowed = self.helper.create_room_as(
            self.local_user_id, tok=self.local_user_token
        )
        self.inject_room_member(
            self.room_allowed, f"@remote:{self.OTHER_SERVER_NAME}", "join"
        )
        # - The remote server will _not_ be in this room
        self.room_blocked = self.helper.create_room_as(
            self.local_user_id, tok=self.local_user_token
        )

        # Insert a linear chain of events in both rooms
        self.room_allowed_event_ids = _send_messages(
            self, self.room_allowed, 5, self.local_user_token
        )
        self.room_blocked_event_ids = _send_messages(
            self, self.room_blocked, 5, self.local_user_token
        )

    def _extract_returned_event_ids(self, json_body: JsonDict) -> Set[str]:
        """
        Given the response body of `/get_missing_events`, return the event IDs
        of the events that were returned in the response.
        This only includes event IDs from `self.room_allowed_event_ids` and
        `self.room_blocked_event_ids`; other events are ignored.

        As the federation PDU format doesn't include event IDs
        (at least not for every room version), we match on the
        `(room_id, content.body, prev_events)` triple against the events
        we sent in the setup.
        """
        store = self.hs.get_datastores().main
        events = self.get_success(
            store.get_events_as_list(
                list(self.room_allowed_event_ids) + list(self.room_blocked_event_ids)
            )
        )
        # (room_id, content.body, prev_events) -> event ID
        event_lookup: Dict[Tuple[str, str, Tuple[str, ...]], str] = {}
        for event in events:
            key = (
                event.room_id,
                event.content["body"],
                tuple(event.prev_event_ids()),
            )
            event_lookup[key] = event.event_id

        returned_event_ids: Set[str] = set()
        for pdu in json_body["events"]:
            key = (
                pdu.get("room_id"),
                pdu.get("content", {}).get("body"),
                tuple(pdu.get("prev_events", [])),
            )
            event_id = event_lookup.get(key)
            if event_id is None:
                # Not one of the events we created; ignore it.
                continue
            returned_event_ids.add(event_id)
        return returned_event_ids

    def _get_missing_events(
        self, earliest_events: List[str], latest_events: List[str]
    ) -> JsonDict:
        channel = self.make_signed_federation_request(
            "POST",
            f"/_matrix/federation/v1/get_missing_events/{self.room_allowed}",
            content={
                "earliest_events": earliest_events,
                "latest_events": latest_events,
                "limit": 10,
            },
        )
        self.assertEqual(HTTPStatus.OK, channel.code, channel.result)
        return channel.json_body

    def test_get_missing_events_returns_events_from_correct_room(self) -> None:
        """Happy path: `latest_events` and `earliest_events` are in the right room."""
        body = self._get_missing_events(
            [self.room_allowed_event_ids[1]], [self.room_allowed_event_ids[3]]
        )
        self.assertEqual(
            self._extract_returned_event_ids(body), {self.room_allowed_event_ids[2]}
        )

    def test_get_missing_events_with_empty_earliest_events(self) -> None:
        """No `earliest_events`: walk back to the start of the room, capped at `limit`."""
        body = self._get_missing_events([], [self.room_allowed_event_ids[-1]])
        self.assertEqual(
            self._extract_returned_event_ids(body),
            set(self.room_allowed_event_ids[:-1]),
        )

    def test_get_missing_events_with_unknown_earliest_event(self) -> None:
        """Unknown `earliest_events` are ignored as stopping conditions."""
        body = self._get_missing_events(
            ["$someUnknownEventId"], [self.room_allowed_event_ids[-1]]
        )
        self.assertEqual(
            self._extract_returned_event_ids(body),
            set(self.room_allowed_event_ids[:-1]),
        )

    def test_get_missing_events_with_no_latest_event(self) -> None:
        """No `latest_events`: 200 OK with an empty `events` list."""
        body = self._get_missing_events(["$someOtherUnknownEventId"], [])
        self.assertEqual(body, {"events": []})

    def test_get_missing_events_with_unknown_latest_event(self) -> None:
        """Unknown `latest_events`: 200 OK with an empty `events` list."""
        body = self._get_missing_events(
            ["$someOtherUnknownEventId"], ["$someUnknownEventId"]
        )
        self.assertEqual(body, {"events": []})

    def test_get_missing_events_ignores_events_from_other_room(self) -> None:
        """
        `earliest_events` and `latest_events` from the wrong room are treated as
        unknown.

        This regression test previously failed.
        """
        body = self._get_missing_events(
            [self.room_blocked_event_ids[0]], [self.room_blocked_event_ids[-1]]
        )
        self.assertEqual(body, {"events": []})

    def test_get_missing_events_skips_latest_events_from_other_room(self) -> None:
        """
        `latest_events` from the wrong room are treated as unknown, even if
        `earliest_events` are from the correct room.

        This regression test previously failed.
        """
        body = self._get_missing_events(
            [self.room_allowed_event_ids[0]], [self.room_blocked_event_ids[-1]]
        )
        self.assertEqual(body, {"events": []})

    def test_get_missing_events_ignores_earliest_events_from_other_room(self) -> None:
        """
        `earliest_events` from the wrong room are ignored as stopping conditions,
        even though `latest_events` are from the correct room.
        """
        body = self._get_missing_events(
            # Use [-3] here as we want to see if the walk-back algorithm
            # confuses depth (topological ordering) across the two rooms.
            [self.room_blocked_event_ids[-3]],
            [self.room_allowed_event_ids[-1]],
        )
        self.assertEqual(
            self._extract_returned_event_ids(body),
            set(self.room_allowed_event_ids[:-1]),
        )


class TimestampToEventTests(unittest.FederatingHomeserverTestCase):
    """
    Tests for `GET /_matrix/federation/v1/timestamp_to_event/<roomID>`.

    https://github.com/element-hq/synapse/security/advisories/GHSA-r66v-qhwx-8rg4
    """

    servlets = [
        admin.register_servlets,
        room.register_servlets,
        login.register_servlets,
    ]

    def prepare(self, reactor: MemoryReactor, clock: Clock, hs: HomeServer) -> None:
        user = self.register_user("u1", "pass")
        tok = self.login("u1", "pass")
        self.room_id = self.helper.create_room_as(user, tok=tok)
        # Send one event at time = 1000s
        self.reactor.advance(1000)
        self.event_at_1000 = _send_messages(self, self.room_id, 1, tok)[0]

        # Send another event at time = 4000s
        self.reactor.advance(3000)
        self.event_at_4000 = _send_messages(self, self.room_id, 1, tok)[0]

        # Send another event at time = 8000s
        self.reactor.advance(4000)
        self.event_at_8000 = _send_messages(self, self.room_id, 1, tok)[0]

        super().prepare(reactor, clock, hs)

    @parameterized.expand(
        [
            # Query backwards from 5000s, should find the event at 4000s
            (5000000, "b"),
            # Query forwards from 1100s, should find the event at 4000s
            (1100000, "f"),
        ]
    )
    def test_happy_path(self, ts: int, dir: str) -> None:
        """A server in the room gets the closest event ID for a timestamp."""
        self.inject_room_member(self.room_id, "@user:" + self.OTHER_SERVER_NAME, "join")

        channel = self.make_signed_federation_request(
            "GET",
            f"/_matrix/federation/v1/timestamp_to_event/{self.room_id}?ts={ts}&dir={dir}",
        )
        self.assertEqual(channel.code, HTTPStatus.OK, channel.json_body)
        self.assertEqual(channel.json_body["event_id"], self.event_at_4000)

    @parameterized.expand(
        [
            # Query backwards at 0s, no events to be found.
            (0, "b"),
            # Query forwards from 8100s, no events to be found.
            (8100000, "f"),
        ]
    )
    def test_no_matching_event(self, ts: int, dir: str) -> None:
        """404 / M_NOT_FOUND when no event exists in the requested direction."""
        self.inject_room_member(self.room_id, "@user:" + self.OTHER_SERVER_NAME, "join")

        channel = self.make_signed_federation_request(
            "GET",
            f"/_matrix/federation/v1/timestamp_to_event/{self.room_id}?ts={ts}&dir={dir}",
        )
        self.assertEqual(channel.code, HTTPStatus.NOT_FOUND, channel.json_body)
        self.assertEqual(channel.json_body["errcode"], "M_NOT_FOUND")

    def test_requires_server_in_room(self) -> None:
        """A server not in the room is rejected with 403 / M_FORBIDDEN."""
        # Notably: _don't_ join the remote server to the room
        channel = self.make_signed_federation_request(
            "GET",
            f"/_matrix/federation/v1/timestamp_to_event/{self.room_id}?ts=2000000&dir=b",
        )
        self.assertEqual(channel.code, HTTPStatus.FORBIDDEN, channel.json_body)
        self.assertEqual(channel.json_body["errcode"], "M_FORBIDDEN")


class EventAuthFederationTests(unittest.FederatingHomeserverTestCase):
    """
    https://github.com/element-hq/synapse/security/advisories/GHSA-qcjr-46gf-7f4r
    """

    servlets = [
        admin.register_servlets,
        room.register_servlets,
        login.register_servlets,
    ]

    def prepare(self, reactor: MemoryReactor, clock: Clock, hs: HomeServer) -> None:
        self.user_id = self.register_user("alice", "password")
        self.user_tok = self.login("alice", "password")

        # Set up a room and join the remote server to it
        self.room_id = self.helper.create_room_as(
            self.user_id,
            is_public=True,
            room_version=RoomVersions.V10.identifier,
            tok=self.user_tok,
        )
        self.inject_room_member(
            self.room_id, f"@remote:{self.OTHER_SERVER_NAME}", Membership.JOIN
        )

        # Create a known event whose auth chain we can request back.
        self.event_id = _send_messages(self, self.room_id, 1, self.user_tok)[0]

        return super().prepare(reactor, clock, hs)

    def test_event_auth_known_event(self) -> None:
        """Sentinel: the happy path still returns an auth chain."""
        channel = self.make_signed_federation_request(
            "GET",
            f"/_matrix/federation/v1/event_auth/{self.room_id}/{self.event_id}",
        )
        self.assertEqual(channel.code, HTTPStatus.OK, channel.result)
        self.assertTrue(channel.json_body["auth_chain"], channel.json_body)

    def test_event_auth_unknown_event_returns_404(self) -> None:
        """Requesting the auth chain of an unknown event returns 404 / M_NOT_FOUND."""
        channel = self.make_signed_federation_request(
            "GET",
            f"/_matrix/federation/v1/event_auth/{self.room_id}/$unknownevent",
        )
        self.assertEqual(channel.code, HTTPStatus.NOT_FOUND, channel.result)
        self.assertEqual(
            channel.json_body["errcode"], Codes.NOT_FOUND, channel.json_body
        )

    def test_event_auth_wrong_room_returns_404(self) -> None:
        """
        A request whose `room_id` is wrong for the event acts the same as though
        it were an unknown event.
        """
        # Create a second room (the remote server is not in it) with its own event.
        other_room_id = self.helper.create_room_as(
            self.user_id,
            is_public=True,
            room_version=RoomVersions.V10.identifier,
            tok=self.user_tok,
        )
        other_room_event_id = _send_messages(self, other_room_id, 1, self.user_tok)[0]

        # Request the chain of other_room_id's event, but pretend it's part of the
        # room we are in.
        channel = self.make_signed_federation_request(
            "GET",
            f"/_matrix/federation/v1/event_auth/{self.room_id}/{other_room_event_id}",
        )

        self.assertEqual(channel.code, HTTPStatus.NOT_FOUND, channel.result)
        self.assertEqual(
            channel.json_body["errcode"], Codes.NOT_FOUND, channel.json_body
        )


class MalformedInviteRoomStateTests(unittest.FederatingHomeserverTestCase):
    """
    A remote server must not be able to break a local user's /sync by sending
    an invite whose `invite_room_state` is not a list.

    https://github.com/element-hq/synapse/security/advisories/GHSA-f3r3-h2mq-hx2h
    (upstream 1.120.1 shipped the fix without a test; this one is ours).
    """

    servlets = [
        admin.register_servlets,
        login.register_servlets,
        room.register_servlets,
        sync.register_servlets,
    ]

    def prepare(self, reactor: MemoryReactor, clock: Clock, hs: HomeServer) -> None:
        super().prepare(reactor, clock, hs)
        self.user_id = self.register_user("bob", "pass")
        self.tok = self.login("bob", "pass")

    def _send_invite(self, invite_room_state: object) -> str:
        room_version = RoomVersions.V10
        room_id = f"!evil:{self.OTHER_SERVER_NAME}"
        event_dict = self.add_hashes_and_signatures_from_other_server(
            {
                "room_id": room_id,
                "type": EventTypes.Member,
                "state_key": self.user_id,
                "sender": f"@mallory:{self.OTHER_SERVER_NAME}",
                "content": {"membership": Membership.INVITE},
                "depth": 10,
                "origin_server_ts": self.clock.time_msec(),
                "prev_events": [],
                "auth_events": [],
            },
            room_version,
        )
        event_id = make_event_from_dict(event_dict, room_version).event_id
        channel = self.make_signed_federation_request(
            "PUT",
            f"/_matrix/federation/v2/invite/{room_id}/{event_id}",
            content={
                "event": event_dict,
                "room_version": room_version.identifier,
                "invite_room_state": invite_room_state,
            },
        )
        self.assertEqual(channel.code, HTTPStatus.OK, channel.json_body)
        return room_id

    @parameterized.expand(
        [
            ("dict", {"not": "a list"}),
            ("int", 5),
            ("list", [{"type": "m.room.name", "state_key": "", "content": {}}]),
        ]
    )
    def test_sync_survives_malformed_invite_room_state(
        self, _name: str, invite_room_state: object
    ) -> None:
        room_id = self._send_invite(invite_room_state)

        channel = self.make_request("GET", "/sync", access_token=self.tok)
        self.assertEqual(channel.code, HTTPStatus.OK, channel.json_body)

        # Sentinel: the invite itself really did arrive.
        invite = channel.json_body["rooms"]["invite"][room_id]
        events = invite["invite_state"]["events"]
        for ev in events:
            self.assertIsInstance(ev, dict, str(events))
        self.assertEqual(events[-1]["state_key"], self.user_id)
        expected_len = (
            len(invite_room_state) + 1 if isinstance(invite_room_state, list) else 1
        )
        self.assertEqual(len(events), expected_len, events)
