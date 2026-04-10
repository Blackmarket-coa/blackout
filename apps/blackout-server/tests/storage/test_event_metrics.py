# Copyright 2019 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the 'License');
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an 'AS IS' BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
from http import HTTPStatus

from prometheus_client import generate_latest

from synapse.api.constants import EventContentFields, EventTypes
from synapse.metrics import REGISTRY
from synapse.rest import admin
from synapse.rest.client import room
from synapse.server import HomeServer
from synapse.types import UserID, create_requester

from tests.unittest import HomeserverTestCase


class ExtremStatisticsTestCase(HomeserverTestCase):
    def test_exposed_to_prometheus(self) -> None:
        """
        Forward extremity counts are exposed via Prometheus.
        """
        room_creator = self.hs.get_room_creation_handler()

        user = UserID("alice", "test")
        requester = create_requester(user)

        # Real events, forward extremities
        events = [(3, 2), (6, 2), (4, 6)]

        for event_count, extrems in events:
            room_id, _, _ = self.get_success(room_creator.create_room(requester, {}))

            last_event = None

            # Make a real event chain
            for _ in range(event_count):
                ev = self.create_and_send_event(room_id, user, False, last_event)
                last_event = [ev]

            # Sprinkle in some extremities
            for _ in range(extrems):
                ev = self.create_and_send_event(room_id, user, False, last_event)

        # Let it run for a while, then pull out the statistics from the
        # Prometheus client registry
        self.reactor.advance(60 * 60 * 1000)
        self.pump(1)

        items = list(
            filter(
                lambda x: b"synapse_forward_extremities_" in x and b"# HELP" not in x,
                generate_latest(REGISTRY).split(b"\n"),
            )
        )

        expected = [
            b'synapse_forward_extremities_bucket{le="1.0"} 0.0',
            b'synapse_forward_extremities_bucket{le="2.0"} 2.0',
            b'synapse_forward_extremities_bucket{le="3.0"} 2.0',
            b'synapse_forward_extremities_bucket{le="5.0"} 2.0',
            b'synapse_forward_extremities_bucket{le="7.0"} 3.0',
            b'synapse_forward_extremities_bucket{le="10.0"} 3.0',
            b'synapse_forward_extremities_bucket{le="15.0"} 3.0',
            b'synapse_forward_extremities_bucket{le="20.0"} 3.0',
            b'synapse_forward_extremities_bucket{le="50.0"} 3.0',
            b'synapse_forward_extremities_bucket{le="100.0"} 3.0',
            b'synapse_forward_extremities_bucket{le="200.0"} 3.0',
            b'synapse_forward_extremities_bucket{le="500.0"} 3.0',
            # per https://docs.google.com/document/d/1KwV0mAXwwbvvifBvDKH_LU1YjyXE_wxCkHNoCGq1GX0/edit#heading=h.wghdjzzh72j9,
            # "inf" is valid: "this includes variants such as inf"
            b'synapse_forward_extremities_bucket{le="inf"} 3.0',
            b"# TYPE synapse_forward_extremities_gcount gauge",
            b"synapse_forward_extremities_gcount 3.0",
            b"# TYPE synapse_forward_extremities_gsum gauge",
            b"synapse_forward_extremities_gsum 10.0",
        ]
        self.assertEqual(items, expected)


class BlackoutEventMetricsTestCase(HomeserverTestCase):
    servlets = [admin.register_servlets, room.register_servlets]

    def default_config(self):
        config = super().default_config()
        config["enable_ephemeral_messages"] = True
        config["blackout"] = {"enabled": True, "signal_event_ttl": "24h"}
        return config

    def prepare(self, reactor, clock, hs: HomeServer) -> None:
        self.room_id = self.helper.create_room_as("@user:test")

    def test_blackout_purged_counter_increments(self) -> None:
        before = REGISTRY.get_sample_value(
            "synapse_blackout_signal_events_purged_total"
        )
        baseline = before if before is not None else 0.0

        res = self.helper.send_event(
            room_id=self.room_id,
            type=EventTypes.BlackoutSignal,
            content={
                "sdp_offer": {"type": "offer", "sdp": "v=0"},
                EventContentFields.SELF_DESTRUCT_AFTER: self.clock.time_msec() + 1000,
            },
        )
        event_id = res["event_id"]

        self.reactor.advance(1)

        # Ensure the event has been purged/censored before checking metric.
        event_content = self._get_event(event_id)["content"]
        self.assertFalse(bool(event_content), event_content)

        after = REGISTRY.get_sample_value("synapse_blackout_signal_events_purged_total")
        self.assertIsNotNone(after)
        assert after is not None
        self.assertGreaterEqual(after, baseline + 1.0)

    def _get_event(self, event_id: str):
        channel = self.make_request(
            "GET", f"/_matrix/client/r0/rooms/{self.room_id}/event/{event_id}"
        )
        self.assertEqual(channel.code, HTTPStatus.OK, channel.result)
        return channel.json_body
