#
# Regression test for GHSA-6qf2-7x63-mm6v, ported by hand from upstream Synapse
# 1.152.1 (tests/rest/client/test_rooms.py) into the Blackout fork. Kept in its
# own module so the large upstream test_rooms.py stays untouched. See
# apps/blackout-server/PATCHES.md.
#
from http import HTTPStatus
from typing import List, Optional

from twisted.test.proto_helpers import MemoryReactor

from synapse.api.constants import EventTypes
from synapse.server import HomeServer
from synapse.util import Clock

from tests.rest.client.test_rooms import RoomBase
from tests.test_utils.event_injection import inject_event


class RoomMessagesPaginationThroughRejectedEventsTestCase(RoomBase):
    user_id = "@sid1:red"

    def prepare(self, reactor: MemoryReactor, clock: Clock, hs: HomeServer) -> None:
        self.room_id = self.helper.create_room_as(self.user_id)

    def test_room_messages_paginate_through_rejected_events(
        self,
    ) -> None:
        """Test that pagination continues past a batch of rejected events.

        Regression test for https://github.com/element-hq/synapse/security/advisories/GHSA-6qf2-7x63-mm6v

        Synapse before 1.152.1 had a bug meaning that a batch full of only
        rejected events would cause `/messages` to not return any more
        pagination tokens, falsely signalling the end of backpagination.
        """
        # Send an early message that should not be filtered.
        early_event_id = self.helper.send(self.room_id, "early message")["event_id"]

        # Inject a batch of events and mark them as rejected in the database.
        # We create more events than a single pagination request would fetch,
        # so that one page of backward pagination request would only see rejected events.
        for _ in range(3):
            event = self.get_success(
                inject_event(
                    self.hs,
                    room_id=self.room_id,
                    sender=self.user_id,
                    type=EventTypes.Message,
                    content={"body": "filtered event", "msgtype": "m.text"},
                )
            )
            self.get_success(
                self.hs.get_datastores().main.db_pool.runInteraction(
                    "mark_rejected",
                    self.hs.get_datastores().main.mark_event_rejected_txn,
                    event.event_id,
                    "testing",
                )
            )

        # Send a message after all the rejected events.
        latest_event_id = self.helper.send(self.room_id, "latest message")["event_id"]

        # Start backpaginating.
        channel = self.make_request(
            "GET", f"/rooms/{self.room_id}/messages?dir=b&limit=2"
        )
        self.assertEqual(channel.code, HTTPStatus.OK, channel.json_body)

        events_in_page = [e["event_id"] for e in channel.json_body["chunk"]]
        end_token: Optional[str] = channel.json_body["end"]

        self.assertEqual(
            events_in_page,
            [latest_event_id],
            "The latest event should be included in the first page we see whilst backpaginating",
        )

        event_ids_in_pages: List[List[str]] = [events_in_page]

        # Bound the number of backpagination attempts to 2
        for _ in range(2):
            channel = self.make_request(
                "GET", f"/rooms/{self.room_id}/messages?from={end_token}&dir=b&limit=2"
            )
            self.assertEqual(channel.code, HTTPStatus.OK, channel.json_body)
            events_in_page = [e["event_id"] for e in channel.json_body["chunk"]]
            event_ids_in_pages.append(events_in_page)

            if early_event_id in events_in_page:
                # We have found the event we were looking for
                return

            self.assertIn(
                "end",
                channel.json_body,
                f"No `end` token received. Did not find {early_event_id} whilst backpaginating ({latest_event_id = }, {event_ids_in_pages = })",
            )
            # Use the end_token in the next iteration
            end_token = channel.json_body["end"]

        self.fail(
            f"Exhausted backpagination attempts. Did not find {early_event_id} whilst backpaginating ({latest_event_id = }, {event_ids_in_pages = })"
        )
