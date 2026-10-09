#
# Regression tests for GHSA-v56r-hwv5-mxg6 ("federation denial of service via
# malformed events", exploited in the wild), ported by hand into the Blackout
# fork. Upstream Synapse 1.127.1 shipped the fix without tests; these are ours.
# See apps/blackout-server/PATCHES.md and
# docs/security/upstream-advisory-triage-2026-10-09.md.
#
from canonicaljson import encode_canonical_json

from synapse.api.constants import (
    CANONICALJSON_MAX_INT,
    CANONICALJSON_MIN_INT,
    MAX_DEPTH,
    EventTypes,
)
from synapse.api.errors import SynapseError
from synapse.api.room_versions import RoomVersions
from synapse.events import make_event_from_dict
from synapse.federation.federation_base import (
    event_from_pdu_json,
    parse_events_from_pdu_json,
)
from synapse.federation.units import (
    Transaction,
    filter_pdus_for_valid_depth,
    serialize_and_filter_pdus,
)
from synapse.types import JsonDict

from tests import unittest


def _pdu(depth: int, n: int = 0) -> JsonDict:
    # Room v1 uses old-style event IDs and does *not* enforce strict canonical
    # JSON, which is the case the advisory is about.
    return {
        "event_id": f"$event{n}:remote.example",
        "room_id": "!room:remote.example",
        "type": EventTypes.Message,
        "sender": "@mallory:remote.example",
        "origin": "remote.example",
        "origin_server_ts": 1000,
        "content": {"body": f"msg {n}"},
        "depth": depth,
        "prev_events": [],
        "auth_events": [],
        "hashes": {"sha256": "aaaa"},
        "signatures": {},
    }


class PduDepthTestCase(unittest.TestCase):
    def test_max_depth_is_canonical_json_limit(self) -> None:
        self.assertEqual(MAX_DEPTH, CANONICALJSON_MAX_INT)
        self.assertEqual(MAX_DEPTH, 2**53 - 1)

    def test_inbound_out_of_range_depth_rejected(self) -> None:
        """Before the fix, a depth up to 2**63-1 was accepted in non-strict rooms."""
        for depth in (CANONICALJSON_MAX_INT + 1, 2**60, 2**63 - 1):
            with self.assertRaises(SynapseError):
                event_from_pdu_json(_pdu(depth), RoomVersions.V1)

    def test_inbound_in_range_depth_accepted(self) -> None:
        ev = event_from_pdu_json(_pdu(CANONICALJSON_MAX_INT), RoomVersions.V1)
        self.assertEqual(ev.depth, CANONICALJSON_MAX_INT)

    def test_parse_events_drops_out_of_range(self) -> None:
        events = parse_events_from_pdu_json(
            [_pdu(5, 1), _pdu(2**60, 2), _pdu(7, 3)], RoomVersions.V1
        )
        self.assertEqual([e.depth for e in events], [5, 7])

    def test_filter_pdus_for_valid_depth(self) -> None:
        pdus = [
            _pdu(1, 1),
            _pdu(CANONICALJSON_MAX_INT + 1, 2),
            _pdu(CANONICALJSON_MIN_INT - 1, 3),
            _pdu(CANONICALJSON_MAX_INT, 4),
        ]
        no_depth = _pdu(1, 5)
        del no_depth["depth"]
        pdus.append(no_depth)
        self.assertEqual(
            [p["event_id"] for p in filter_pdus_for_valid_depth(pdus)],
            ["$event1:remote.example", "$event4:remote.example"],
        )

    def test_outbound_transaction_drops_bad_pdu(self) -> None:
        """
        One bad PDU used to be forwarded inside every outgoing transaction.
        `canonicaljson` itself encodes the oversized int without complaint
        (checked: 2.0.0), so the breakage is on the receiving side: peers that
        enforce the canonical-JSON integer range reject the transaction, which
        stalls federation to them.
        """
        bad = _pdu(2**60, 2)

        txn = Transaction(
            transaction_id="1",
            origin="test",
            destination="remote.example",
            origin_server_ts=0,
            pdus=[_pdu(1, 1), bad, _pdu(2, 3)],
        )
        body = txn.get_dict()
        self.assertEqual([p["depth"] for p in body["pdus"]], [1, 2])
        # And the result is valid canonical JSON as far as the int range goes.
        encode_canonical_json(body)

    def test_serialize_and_filter_pdus(self) -> None:
        good = make_event_from_dict(_pdu(3, 1), RoomVersions.V1)
        bad = make_event_from_dict(_pdu(2**60, 2), RoomVersions.V1)
        out = serialize_and_filter_pdus([good, bad])
        self.assertEqual([p["depth"] for p in out], [3])
