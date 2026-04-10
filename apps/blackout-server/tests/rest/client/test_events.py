# Copyright 2014-2016 OpenMarket Ltd
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

""" Tests REST events for /events paths."""

from unittest.mock import Mock

from twisted.test.proto_helpers import MemoryReactor

import synapse.rest.admin
from synapse.api.constants import EduTypes
from synapse.rest.client import events, login, room
from synapse.server import HomeServer
from synapse.util import Clock

from tests import unittest


class EventStreamPermissionsTestCase(unittest.HomeserverTestCase):
    """Tests event streaming (GET /events)."""

    servlets = [
        events.register_servlets,
        room.register_servlets,
        synapse.rest.admin.register_servlets_for_client_rest_resource,
        login.register_servlets,
    ]

    def make_homeserver(self, reactor: MemoryReactor, clock: Clock) -> HomeServer:
        config = self.default_config()
        config["enable_registration_captcha"] = False
        config["enable_registration"] = True
        config["auto_join_rooms"] = []

        hs = self.setup_test_homeserver(config=config)

        hs.get_federation_handler = Mock()  # type: ignore[method-assign]

        return hs

    def prepare(self, reactor: MemoryReactor, clock: Clock, hs: HomeServer) -> None:
        # register an account
        self.user_id = self.register_user("sid1", "pass")
        self.token = self.login(self.user_id, "pass")

        # register a 2nd account
        self.other_user = self.register_user("other2", "pass")
        self.other_token = self.login(self.other_user, "pass")

    def test_stream_basic_permissions(self) -> None:
        # invalid token, expect 401
        # note: this is in violation of the original v1 spec, which expected
        # 403. However, since the v1 spec no longer exists and the v1
        # implementation is now part of the r0 implementation, the newer
        # behaviour is used instead to be consistent with the r0 spec.
        # see issue https://github.com/matrix-org/synapse/issues/2602
        channel = self.make_request(
            "GET", "/events?access_token=%s" % ("invalid" + self.token,)
        )
        self.assertEqual(channel.code, 401, msg=channel.result)

        # valid token, expect content
        channel = self.make_request(
            "GET", "/events?access_token=%s&timeout=0" % (self.token,)
        )
        self.assertEqual(channel.code, 200, msg=channel.result)
        self.assertTrue("chunk" in channel.json_body)
        self.assertTrue("start" in channel.json_body)
        self.assertTrue("end" in channel.json_body)

    def test_stream_room_permissions(self) -> None:
        room_id = self.helper.create_room_as(self.other_user, tok=self.other_token)
        self.helper.send(room_id, tok=self.other_token)

        # invited to room (expect no content for room)
        self.helper.invite(
            room_id, src=self.other_user, targ=self.user_id, tok=self.other_token
        )

        # valid token, expect content
        channel = self.make_request(
            "GET", "/events?access_token=%s&timeout=0" % (self.token,)
        )
        self.assertEqual(channel.code, 200, msg=channel.result)

        # We may get a presence event for ourselves down
        self.assertEqual(
            0,
            len(
                [
                    c
                    for c in channel.json_body["chunk"]
                    if not (
                        c.get("type") == EduTypes.PRESENCE
                        and c["content"].get("user_id") == self.user_id
                    )
                ]
            ),
        )

        # joined room (expect all content for room)
        self.helper.join(room=room_id, user=self.user_id, tok=self.token)

        # left to room (expect no content for room)

    def test_stream_items(self) -> None:
        room_id = self.helper.create_room_as(self.user_id, tok=self.token)

        # Join the room as another user and perform a couple of timeline actions.
        self.helper.join(room=room_id, user=self.other_user, tok=self.other_token)
        self.helper.send(room_id, body="hello", tok=self.other_token)
        self.helper.send_state(
            room_id,
            "m.room.topic",
            {"topic": "example topic"},
            tok=self.other_token,
        )

        channel = self.make_request(
            "GET", "/events?access_token=%s&timeout=0" % (self.token,)
        )
        self.assertEqual(channel.code, 200, msg=channel.result)

        room_events = [
            event
            for event in channel.json_body["chunk"]
            if event.get("room_id") == room_id
            and event.get("sender") == self.other_user
        ]

        room_event_types = [event["type"] for event in room_events]

        self.assertEqual(
            room_event_types,
            ["m.room.member", "m.room.message", "m.room.topic"],
            msg=room_events,
        )


class GetEventsTestCase(unittest.HomeserverTestCase):
    servlets = [
        events.register_servlets,
        room.register_servlets,
        synapse.rest.admin.register_servlets_for_client_rest_resource,
        login.register_servlets,
    ]

    def prepare(self, reactor: MemoryReactor, clock: Clock, hs: HomeServer) -> None:
        # register an account
        self.user_id = self.register_user("sid1", "pass")
        self.token = self.login(self.user_id, "pass")

        self.room_id = self.helper.create_room_as(self.user_id, tok=self.token)

    def test_get_event_via_events(self) -> None:
        resp = self.helper.send(self.room_id, tok=self.token)
        event_id = resp["event_id"]

        channel = self.make_request(
            "GET",
            "/events/" + event_id,
            access_token=self.token,
        )
        self.assertEqual(channel.code, 200, msg=channel.result)
