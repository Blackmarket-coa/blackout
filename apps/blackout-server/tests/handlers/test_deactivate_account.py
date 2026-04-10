# Copyright 2021 The Matrix.org Foundation C.I.C.
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

from asyncio import CancelledError
from unittest import mock

from twisted.test.proto_helpers import MemoryReactor

from synapse.api.constants import AccountDataTypes
from synapse.api.errors import SynapseError
from synapse.push.rulekinds import PRIORITY_CLASS_MAP
from synapse.rest import admin
from synapse.rest.client import account, login
from synapse.server import HomeServer
from synapse.synapse_rust.push import PushRule
from synapse.util import Clock

from tests.unittest import HomeserverTestCase


class DeactivateAccountTestCase(HomeserverTestCase):
    servlets = [
        login.register_servlets,
        admin.register_servlets,
        account.register_servlets,
    ]

    def prepare(self, reactor: MemoryReactor, clock: Clock, hs: HomeServer) -> None:
        self._store = hs.get_datastores().main

        self.user = self.register_user("user", "pass")
        self.token = self.login("user", "pass")

    def _deactivate_my_account(self) -> None:
        """
        Deactivates the account `self.user` using `self.token` and asserts
        that it returns a 200 success code.
        """
        req = self.make_request(
            "POST",
            "account/deactivate",
            {
                "auth": {
                    "type": "m.login.password",
                    "user": self.user,
                    "password": "pass",
                },
                "erase": True,
            },
            access_token=self.token,
        )

        self.assertEqual(req.code, 200, req)

    def test_deactivate_account_starts_single_user_parter_loop(self) -> None:
        handler = self.hs.get_deactivate_account_handler()

        with mock.patch(
            "synapse.handlers.deactivate_account.run_as_background_process"
        ) as run_bg:
            handler._start_user_parting()
            handler._start_user_parting()

        run_bg.assert_called_once_with("user_parter_loop", handler._user_parter_loop)

    def test_start_user_parting_resets_guard_on_schedule_error(self) -> None:
        handler = self.hs.get_deactivate_account_handler()

        with mock.patch(
            "synapse.handlers.deactivate_account.run_as_background_process",
            side_effect=[RuntimeError("cannot schedule"), None],
        ) as run_bg:
            with self.assertRaises(RuntimeError):
                handler._start_user_parting()

            self.assertFalse(handler._user_parter_running)

            handler._start_user_parting()

        self.assertTrue(handler._user_parter_running)
        self.assertEqual(run_bg.call_count, 2)

    def test_part_user_propagates_cancellation(self) -> None:
        handler = self.hs.get_deactivate_account_handler()

        with mock.patch.object(
            handler.store,
            "get_rooms_for_user",
            new=mock.AsyncMock(return_value=["!room:test"]),
        ), mock.patch.object(
            handler._room_member_handler,
            "update_membership",
            new=mock.AsyncMock(side_effect=CancelledError()),
        ):
            # CancelledError should propagate out of _part_user rather than
            # being swallowed by the per-room exception handler.
            self.get_failure(handler._part_user(self.user), CancelledError)

    def test_threepid_unbind_cancellation_propagates(self) -> None:
        """
        Cancellation while unbinding threepids must propagate so shutdown/cancel
        semantics are preserved.
        """
        handler = self.hs.get_deactivate_account_handler()

        with mock.patch.object(
            handler.store,
            "user_get_bound_threepids",
            new=mock.AsyncMock(return_value=[("email", "alice@example.com")]),
        ), mock.patch.object(
            handler._identity_handler,
            "try_unbind_threepid",
            new=mock.AsyncMock(side_effect=CancelledError()),
        ):
            self.get_failure(
                handler.deactivate_account(
                    self.user,
                    erase_data=False,
                    requester=mock.Mock(user=mock.Mock(to_string=lambda: self.user)),
                    id_server=None,
                    by_admin=False,
                ),
                CancelledError,
            )

    def test_threepid_unbind_failure_aborts_deactivation(self) -> None:
        """
        Failing to unbind a threepid from the identity server must abort the
        deactivation so the account stays active and the user can retry.
        """
        handler = self.hs.get_deactivate_account_handler()

        # Pretend the user has one bound threepid.
        with mock.patch.object(
            handler.store,
            "user_get_bound_threepids",
            new=mock.AsyncMock(return_value=[("email", "alice@example.com")]),
        ), mock.patch.object(
            handler._identity_handler,
            "try_unbind_threepid",
            new=mock.AsyncMock(side_effect=Exception("IS is down")),
        ):
            failure = self.get_failure(
                handler.deactivate_account(
                    self.user,
                    erase_data=False,
                    requester=mock.Mock(user=mock.Mock(to_string=lambda: self.user)),
                    id_server=None,
                    by_admin=False,
                ),
                SynapseError,
            )
            # The deactivation should fail with 400 so the account remains active.
            self.assertEqual(failure.value.code, 400)

        # Verify the user is still active (not deactivated).
        deactivated = self.get_success(
            self._store.get_user_deactivated_status(self.user)
        )
        self.assertFalse(deactivated)

    def test_reject_pending_invites_logs_summary(self) -> None:
        """
        When rejecting pending invites during deactivation, a summary line
        must be logged with the counts of rejected and failed invites.
        """
        handler = self.hs.get_deactivate_account_handler()

        # Fabricate two pending invites.
        fake_invite_1 = mock.Mock(room_id="!room1:test")
        fake_invite_2 = mock.Mock(room_id="!room2:test")

        # First invite succeeds, second fails.
        call_count = 0

        async def update_membership_side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise RuntimeError("simulated failure")

        with mock.patch.object(
            handler.store,
            "get_invited_rooms_for_local_user",
            new=mock.AsyncMock(return_value=[fake_invite_1, fake_invite_2]),
        ), mock.patch.object(
            handler._room_member_handler,
            "update_membership",
            new=mock.AsyncMock(side_effect=update_membership_side_effect),
        ), mock.patch(
            "synapse.handlers.deactivate_account.logger"
        ) as mock_logger:
            self.get_success(handler._reject_pending_invites_for_user(self.user))

        # Find the summary log call.
        summary_calls = [
            c
            for c in mock_logger.info.call_args_list
            if "Invite rejection summary" in str(c)
        ]
        self.assertEqual(len(summary_calls), 1)
        # Verify the counts: 1 rejected, 1 failed, 2 total.
        args = summary_calls[0][0]
        self.assertEqual(args[2], 1)  # rejected
        self.assertEqual(args[3], 1)  # failed
        self.assertEqual(args[4], 2)  # total

    def test_global_account_data_deleted_upon_deactivation(self) -> None:
        """
        Tests that global account data is removed upon deactivation.
        """
        # Add some account data
        self.get_success(
            self._store.add_account_data_for_user(
                self.user,
                AccountDataTypes.DIRECT,
                {"@someone:remote": ["!somewhere:remote"]},
            )
        )

        # Check that we actually added some.
        self.assertIsNotNone(
            self.get_success(
                self._store.get_global_account_data_by_type_for_user(
                    self.user, AccountDataTypes.DIRECT
                )
            ),
        )

        # Request the deactivation of our account
        self._deactivate_my_account()

        # Check that the account data does not persist.
        self.assertIsNone(
            self.get_success(
                self._store.get_global_account_data_by_type_for_user(
                    self.user, AccountDataTypes.DIRECT
                )
            ),
        )

    def test_room_account_data_deleted_upon_deactivation(self) -> None:
        """
        Tests that room account data is removed upon deactivation.
        """
        room_id = "!room:test"

        # Add some room account data
        self.get_success(
            self._store.add_account_data_to_room(
                self.user,
                room_id,
                "m.fully_read",
                {"event_id": "$aaaa:test"},
            )
        )

        # Check that we actually added some.
        self.assertIsNotNone(
            self.get_success(
                self._store.get_account_data_for_room_and_type(
                    self.user, room_id, "m.fully_read"
                )
            ),
        )

        # Request the deactivation of our account
        self._deactivate_my_account()

        # Check that the account data does not persist.
        self.assertIsNone(
            self.get_success(
                self._store.get_account_data_for_room_and_type(
                    self.user, room_id, "m.fully_read"
                )
            ),
        )

    def _is_custom_rule(self, push_rule: PushRule) -> bool:
        """
        Default rules start with a dot: such as .m.rule and .im.vector.
        This function returns true iff a rule is custom (not default).
        """
        return "/." not in push_rule.rule_id

    def test_push_rules_deleted_upon_account_deactivation(self) -> None:
        """
        Push rules are a special case of account data.
        They are stored separately but get sent to the client as account data in /sync.
        This tests that deactivating a user deletes push rules along with the rest
        of their account data.
        """

        # Add a push rule
        self.get_success(
            self._store.add_push_rule(
                self.user,
                "personal.override.rule1",
                PRIORITY_CLASS_MAP["override"],
                [],
                [],
            )
        )

        # Test the rule exists
        filtered_push_rules = self.get_success(
            self._store.get_push_rules_for_user(self.user)
        )
        # Filter out default rules; we don't care
        push_rules = [
            r for r, _ in filtered_push_rules.rules() if self._is_custom_rule(r)
        ]
        # Check our rule made it
        self.assertEqual(len(push_rules), 1)
        self.assertEqual(push_rules[0].rule_id, "personal.override.rule1")
        self.assertEqual(push_rules[0].priority_class, 5)
        self.assertEqual(push_rules[0].conditions, [])
        self.assertEqual(push_rules[0].actions, [])

        # Request the deactivation of our account
        self._deactivate_my_account()

        filtered_push_rules = self.get_success(
            self._store.get_push_rules_for_user(self.user)
        )
        # Filter out default rules; we don't care
        push_rules = [
            r for r, _ in filtered_push_rules.rules() if self._is_custom_rule(r)
        ]
        # Check our rule no longer exists
        self.assertEqual(push_rules, [], push_rules)

    def test_ignored_users_deleted_upon_deactivation(self) -> None:
        """
        Ignored users are a special case of account data.
        They get denormalised into the `ignored_users` table upon being stored as
        account data.
        Test that a user's list of ignored users is deleted upon deactivation.
        """

        # Add an ignored user
        self.get_success(
            self._store.add_account_data_for_user(
                self.user,
                AccountDataTypes.IGNORED_USER_LIST,
                {"ignored_users": {"@sheltie:test": {}}},
            )
        )

        # Test the user is ignored
        self.assertEqual(
            self.get_success(self._store.ignored_by("@sheltie:test")), {self.user}
        )

        # Request the deactivation of our account
        self._deactivate_my_account()

        # Test the user is no longer ignored by the user that was deactivated
        self.assertEqual(
            self.get_success(self._store.ignored_by("@sheltie:test")), set()
        )

    def _rerun_retroactive_account_data_deletion_update(self) -> None:
        # Reset the 'all done' flag
        self._store.db_pool.updates._all_done = False

        self.get_success(
            self._store.db_pool.simple_insert(
                "background_updates",
                {
                    "update_name": "delete_account_data_for_deactivated_users",
                    "progress_json": "{}",
                },
            )
        )

        self.wait_for_background_updates()

    def test_account_data_deleted_retroactively_by_background_update_if_deactivated(
        self,
    ) -> None:
        """
        Tests that a user, who deactivated their account before account data was
        deleted automatically upon deactivation, has their account data retroactively
        scrubbed by the background update.
        """

        # Request the deactivation of our account
        self._deactivate_my_account()

        # Add some account data
        # (we do this after the deactivation so that the act of deactivating doesn't
        # clear it out. This emulates a user that was deactivated before this was cleared
        # upon deactivation.)
        self.get_success(
            self._store.add_account_data_for_user(
                self.user,
                AccountDataTypes.DIRECT,
                {"@someone:remote": ["!somewhere:remote"]},
            )
        )

        # Check that the account data is there.
        self.assertIsNotNone(
            self.get_success(
                self._store.get_global_account_data_by_type_for_user(
                    self.user,
                    AccountDataTypes.DIRECT,
                )
            ),
        )

        # Re-run the retroactive deletion update
        self._rerun_retroactive_account_data_deletion_update()

        # Check that the account data was cleared.
        self.assertIsNone(
            self.get_success(
                self._store.get_global_account_data_by_type_for_user(
                    self.user,
                    AccountDataTypes.DIRECT,
                )
            ),
        )

    def test_account_data_preserved_by_background_update_if_not_deactivated(
        self,
    ) -> None:
        """
        Tests that the background update does not scrub account data for users that have
        not been deactivated.
        """

        # Add some account data
        # (we do this after the deactivation so that the act of deactivating doesn't
        # clear it out. This emulates a user that was deactivated before this was cleared
        # upon deactivation.)
        self.get_success(
            self._store.add_account_data_for_user(
                self.user,
                AccountDataTypes.DIRECT,
                {"@someone:remote": ["!somewhere:remote"]},
            )
        )

        # Check that the account data is there.
        self.assertIsNotNone(
            self.get_success(
                self._store.get_global_account_data_by_type_for_user(
                    self.user,
                    AccountDataTypes.DIRECT,
                )
            ),
        )

        # Re-run the retroactive deletion update
        self._rerun_retroactive_account_data_deletion_update()

        # Check that the account data was NOT cleared.
        self.assertIsNotNone(
            self.get_success(
                self._store.get_global_account_data_by_type_for_user(
                    self.user,
                    AccountDataTypes.DIRECT,
                )
            ),
        )

    def test_deactivate_account_needs_auth(self) -> None:
        """
        Tests that making a request to /deactivate with an empty body
        succeeds in starting the user-interactive auth flow.
        """
        req = self.make_request(
            "POST",
            "account/deactivate",
            {},
            access_token=self.token,
        )

        self.assertEqual(req.code, 401, req)
        self.assertEqual(req.json_body["flows"], [{"stages": ["m.login.password"]}])
