from __future__ import annotations

from blackout_runtime.module import BlackoutRuntimeModule
from synapse.rest import admin
from synapse.rest.client import login, register, room

from tests.unittest import HomeserverTestCase


class BlackoutRuntimeModuleE2ETestCase(HomeserverTestCase):
    servlets = [
        admin.register_servlets,
        login.register_servlets,
        register.register_servlets,
        room.register_servlets,
    ]

    def create_resource_dict(self):
        BlackoutRuntimeModule(
            {"persistence_path": "/tmp/blackout_runtime_e2e.sqlite3"},
            self.hs.get_module_api(),
        )
        resources = super().create_resource_dict()
        resources.update(self.hs._module_web_resources)
        return resources

    def prepare(self, reactor, clock, hs):
        self.user_id = self.register_user("alice", "pass")
        self.tok = self.login("alice", "pass")

    def test_governance_and_reputation_synapse_api_endpoints_live(self) -> None:
        room_id = self.helper.create_room_as(
            self.user_id,
            tok=self.tok,
            is_public=False,
            extra_content={
                "creation_content": {"m.blackout.channel.type": "governance"}
            },
        )

        self.helper.send_event(
            room_id,
            "m.blackout.governance.proposal",
            {
                "proposal_id": "p1",
                "title": "Activate",
                "options": ["yes", "no"],
                "opens_at": 0,
                "closes_at": 4_000_000_000,
            },
            tok=self.tok,
        )

        self.helper.send_event(
            room_id,
            "m.blackout.governance.vote",
            {"proposal_id": "p1", "vote": "yes", "decision": "accepted"},
            tok=self.tok,
        )

        decisions = self.make_request(
            "GET",
            f"/_synapse/client/blackout/governance/decisions?room_id={room_id}&since=0",
            access_token=self.tok,
        )
        self.assertEqual(decisions.code, 200, decisions.result)
        self.assertEqual(decisions.json_body["decisions"][0]["decision"], "accepted")

        rep = self.make_request(
            "PUT",
            f"/_matrix/client/v3/rooms/{room_id}/send/m.blackout.reputation.update/2",
            {
                "node_id": "node-1",
                "delta": 2,
                "reason": "delivery_success",
                "rating": 4,
            },
            access_token=self.tok,
        )
        self.assertEqual(rep.code, 200, rep.result)

        reputation = self.make_request(
            "GET",
            "/_synapse/client/blackout/reputation/node-1",
            access_token=self.tok,
        )
        self.assertEqual(reputation.code, 200, reputation.result)
        self.assertEqual(reputation.json_body["node_id"], "node-1")

    def test_vote_uniqueness_and_rate_limiting(self) -> None:
        room_id = self.helper.create_room_as(
            self.user_id,
            tok=self.tok,
            is_public=False,
            extra_content={
                "creation_content": {"m.blackout.channel.type": "governance"}
            },
        )

        self.helper.send_event(
            room_id,
            "m.blackout.governance.proposal",
            {
                "proposal_id": "p2",
                "title": "Route",
                "options": ["yes", "no"],
                "opens_at": 0,
                "closes_at": 4_000_000_000,
            },
            tok=self.tok,
        )

        self.helper.send_event(
            room_id,
            "m.blackout.governance.vote",
            {"proposal_id": "p2", "vote": "yes", "decision": "accepted"},
            tok=self.tok,
        )

        second_vote = self.make_request(
            "PUT",
            f"/_matrix/client/v3/rooms/{room_id}/send/m.blackout.governance.vote/11",
            {"proposal_id": "p2", "vote": "no"},
            access_token=self.tok,
        )
        self.assertEqual(second_vote.code, 403, second_vote.result)

    def test_stego_policy_and_entitlement_are_enforced_for_signal_events(self) -> None:
        room_id = self.helper.create_room_as(
            self.user_id,
            tok=self.tok,
            is_public=False,
            extra_content={
                "creation_content": {"m.blackout.channel.type": "governance"}
            },
        )

        self.helper.send_state(
            room_id,
            "m.blackout.stego.policy",
            {"allow_stego": True, "max_ttl_hours": 24},
            tok=self.tok,
        )

        self.helper.send_state(
            room_id,
            "m.blackout.entitlements",
            {self.user_id: ["stego:send"]},
            tok=self.tok,
        )

        allowed = self.make_request(
            "PUT",
            f"/_matrix/client/v3/rooms/{room_id}/send/m.blackout.signal/21",
            {
                "schema_version": 2,
                "message_metadata": {
                    "message_id": "m1",
                    "sender_key_id": "k1",
                    "content_class": "control",
                },
                "blackout_stego": {
                    "carrier": "image",
                    "payload_hash": "abcdef1234567890",
                    "policy_id": "policy-1",
                    "ttl_hours": 12,
                }
            },
            access_token=self.tok,
        )
        self.assertEqual(allowed.code, 200, allowed.result)

        revoked = self.helper.send_state(
            room_id,
            "m.blackout.entitlements",
            {},
            tok=self.tok,
        )
        self.assertIn("event_id", revoked)

        blocked = self.make_request(
            "PUT",
            f"/_matrix/client/v3/rooms/{room_id}/send/m.blackout.signal/22",
            {
                "schema_version": 2,
                "message_metadata": {
                    "message_id": "m2",
                    "sender_key_id": "k1",
                    "content_class": "control",
                },
                "blackout_stego": {
                    "carrier": "image",
                    "payload_hash": "abcdef1234567890",
                    "policy_id": "policy-1",
                    "ttl_hours": 12,
                }
            },
            access_token=self.tok,
        )
        self.assertEqual(blocked.code, 403, blocked.result)
