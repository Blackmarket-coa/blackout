# Copyright 2023 The Matrix.org Foundation C.I.C.
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
from typing import List, Optional, Tuple

from twisted.test.proto_helpers import MemoryReactor

from synapse.server import HomeServer
from synapse.storage._base import db_to_json
from synapse.storage.database import LoggingTransaction
from synapse.types import JsonDict
from synapse.util import Clock

from tests.unittest import HomeserverTestCase


class EndToEndKeyWorkerStoreTestCase(HomeserverTestCase):
    def prepare(self, reactor: MemoryReactor, clock: Clock, hs: HomeServer) -> None:
        self.store = hs.get_datastores().main

    def test_get_master_cross_signing_key_updatable_before(self) -> None:
        # Should return False, None when there is no master key.
        alice = "@alice:test"
        exists, timestamp = self.get_success(
            self.store.get_master_cross_signing_key_updatable_before(alice)
        )
        self.assertIs(exists, False)
        self.assertIsNone(timestamp)

        # Upload a master key.
        dummy_key = {"keys": {"a": "b"}}
        self.get_success(
            self.store.set_e2e_cross_signing_key(alice, "master", dummy_key)
        )

        # Should now find that the key exists.
        exists, timestamp = self.get_success(
            self.store.get_master_cross_signing_key_updatable_before(alice)
        )
        self.assertIs(exists, True)
        self.assertIsNone(timestamp)

        # Write an updateable_before timestamp.
        written_timestamp = self.get_success(
            self.store.allow_master_cross_signing_key_replacement_without_uia(
                alice, 1000
            )
        )

        # Should now find that the key exists.
        exists, timestamp = self.get_success(
            self.store.get_master_cross_signing_key_updatable_before(alice)
        )
        self.assertIs(exists, True)
        self.assertEqual(timestamp, written_timestamp)

    def test_master_replacement_only_applies_to_latest_master_key(
        self,
    ) -> None:
        """We shouldn't allow updates w/o UIA to old master keys or other key types."""
        alice = "@alice:test"
        # Upload two master keys.
        key1 = {"keys": {"a": "b"}}
        key2 = {"keys": {"c": "d"}}
        key3 = {"keys": {"e": "f"}}
        self.get_success(self.store.set_e2e_cross_signing_key(alice, "master", key1))
        self.get_success(self.store.set_e2e_cross_signing_key(alice, "other", key2))
        self.get_success(self.store.set_e2e_cross_signing_key(alice, "master", key3))

        # Third key should be the current one.
        key = self.get_success(
            self.store.get_e2e_cross_signing_key(alice, "master", alice)
        )
        self.assertEqual(key, key3)

        timestamp = self.get_success(
            self.store.allow_master_cross_signing_key_replacement_without_uia(
                alice, 1000
            )
        )
        assert timestamp is not None

        def check_timestamp_column(
            txn: LoggingTransaction,
        ) -> List[Tuple[JsonDict, Optional[int]]]:
            """Fetch all rows for Alice's keys."""
            txn.execute(
                """
                SELECT keydata, updatable_without_uia_before_ms
                FROM e2e_cross_signing_keys
                WHERE user_id = ?
                ORDER BY stream_id ASC;
            """,
                (alice,),
            )
            return [(db_to_json(keydata), ts) for keydata, ts in txn.fetchall()]

        values = self.get_success(
            self.store.db_pool.runInteraction(
                "check_timestamp_column",
                check_timestamp_column,
            )
        )
        self.assertEqual(
            values,
            [
                (key1, None),
                (key2, None),
                (key3, timestamp),
            ],
        )

    def test_device_key_revocation_marker_created_on_device_key_delete(self) -> None:
        user_id = "@alice:test"
        device_id = "ALICEDEVICE"
        key_json = {
            "user_id": user_id,
            "device_id": device_id,
            "algorithms": ["m.olm.curve25519-aes-sha2"],
            "keys": {
                "ed25519:ALICEDEVICE": "ed25519-key-material",
                "curve25519:ALICEDEVICE": "curve25519-key-material",
            },
        }

        self.get_success(
            self.store.set_e2e_device_keys(user_id, device_id, 1_000, key_json)
        )
        self.get_success(self.store.delete_e2e_keys_by_device(user_id, device_id))

        revoked_ts = self.get_success(
            self.store.get_revoked_device_key_timestamp(user_id, "ed25519:ALICEDEVICE")
        )
        self.assertIsNotNone(revoked_ts)

        revoked_by_value_ts = self.get_success(
            self.store.get_revoked_device_key_timestamp(user_id, "ed25519-key-material")
        )
        self.assertEqual(revoked_by_value_ts, revoked_ts)

        revoked_for_device_ts = self.get_success(
            self.store.get_revoked_device_key_timestamp_for_device(user_id, device_id)
        )
        self.assertEqual(revoked_for_device_ts, revoked_ts)

    def test_get_revoked_device_key_timestamps_for_devices(self) -> None:
        user_id = "@alice:test"
        device_ids = ["A", "B"]

        for i, device_id in enumerate(device_ids):
            self.get_success(
                self.store.set_e2e_device_keys(
                    user_id,
                    device_id,
                    1_000 + i,
                    {
                        "user_id": user_id,
                        "device_id": device_id,
                        "keys": {f"ed25519:{device_id}": f"key-{device_id}"},
                    },
                )
            )
            self.get_success(self.store.delete_e2e_keys_by_device(user_id, device_id))

        revoked_by_device = self.get_success(
            self.store.get_revoked_device_key_timestamps_for_devices(
                user_id, ["A", "B", "C"]
            )
        )

        self.assertCountEqual(revoked_by_device.keys(), ["A", "B"])
        self.assertIsInstance(revoked_by_device["A"], int)
        self.assertIsInstance(revoked_by_device["B"], int)

    def test_rejects_setting_device_keys_after_device_revocation(self) -> None:
        user_id = "@alice:test"
        device_id = "ALICEDEVICE"
        key_json = {
            "user_id": user_id,
            "device_id": device_id,
            "keys": {"ed25519:ALICEDEVICE": "ed25519-key-material"},
        }

        self.get_success(
            self.store.set_e2e_device_keys(user_id, device_id, 1_000, key_json)
        )
        self.get_success(self.store.delete_e2e_keys_by_device(user_id, device_id))

        with self.assertRaises(ValueError):
            self.get_success(
                self.store.set_e2e_device_keys(user_id, device_id, 2_000, key_json)
            )

    def test_upsert_device_key_revocations_records_key_identifier_and_value(
        self,
    ) -> None:
        user_id = "@alice:test"
        device_id = "ALICEDEVICE"
        revoked_ts = 7_777
        self.get_success(
            self.store.upsert_device_key_revocations(
                user_id,
                device_id,
                revoked_ts,
                {
                    "ed25519:ALICEDEVICE": "ed25519-key-material",
                    "curve25519:ALICEDEVICE": "curve25519-key-material",
                },
            )
        )

        self.assertEqual(
            self.get_success(
                self.store.get_revoked_device_key_timestamp(
                    user_id, "ed25519:ALICEDEVICE"
                )
            ),
            revoked_ts,
        )
        self.assertEqual(
            self.get_success(
                self.store.get_revoked_device_key_timestamp(
                    user_id, "curve25519-key-material"
                )
            ),
            revoked_ts,
        )

    def test_federation_query_includes_revoked_deleted_devices(self) -> None:
        user_id = "@alice:test"
        device_id = "ALICEDEVICE"
        key_json = {
            "user_id": user_id,
            "device_id": device_id,
            "keys": {
                "ed25519:ALICEDEVICE": "ed25519-key-material",
            },
        }
        self.get_success(self.store.store_device(user_id, device_id))
        self.get_success(
            self.store.set_e2e_device_keys(user_id, device_id, 1_000, key_json)
        )
        self.get_success(self.store.delete_e2e_keys_by_device(user_id, device_id))

        _, devices = self.get_success(
            self.store.get_e2e_device_keys_for_federation_query(user_id)
        )
        revoked_device = next(d for d in devices if d["device_id"] == device_id)
        self.assertTrue(revoked_device["deleted"])
        self.assertTrue(revoked_device["org.matrix.msc_blackout_device_revoked"])
        self.assertIsInstance(
            revoked_device["org.matrix.msc_blackout_device_revoked_ts"], int
        )
