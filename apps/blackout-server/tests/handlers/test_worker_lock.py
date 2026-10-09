# Copyright 2023 The Matrix.org Foundation C.I.C.
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

from twisted.internet import defer
from twisted.test.proto_helpers import MemoryReactor

from synapse.handlers.worker_lock import WORKER_LOCK_MAX_RETRY_INTERVAL_SECS
from synapse.server import HomeServer
from synapse.storage.databases.main.lock import _RENEWAL_INTERVAL_MS
from synapse.util import Clock

from tests import unittest
from tests.replication._base import BaseMultiWorkerStreamTestCase


class WorkerLockTestCase(unittest.HomeserverTestCase):
    def prepare(
        self, reactor: MemoryReactor, clock: Clock, homeserver: HomeServer
    ) -> None:
        self.worker_lock_handler = self.hs.get_worker_locks_handler()

    def _pump_by(self, *, amount_secs: float, by_secs: float = 0.1) -> None:
        """
        Like `self.pump()` but you can specify the time increment to advance with until
        you reach the time amount. Unlike `self.pump()`, this doesn't multiply the time.

        (Ported from upstream Synapse 1.152.1, which takes `Duration`s.)
        """
        end_time_s = self.reactor.seconds() + amount_secs
        while self.reactor.seconds() < end_time_s:
            self.reactor.advance(by_secs)

    def test_timeouts_for_lock_locally(self) -> None:
        """
        Test that we regularly retry to reacquire locks.

        Ported from upstream Synapse 1.152.1 (GHSA-8q93-326v-3m7g). Note: on this
        1.98-based tree the upstream test alone does not discriminate (the lock
        release still notifies the waiter); see
        `test_missed_notification_is_retried_within_cap` for one that does.
        """
        # Create and acquire the first lock
        lock1 = self.worker_lock_handler.acquire_lock("name", "key")
        self.get_success(lock1.__aenter__())

        # Create and try to acquire the second lock
        lock2 = self.worker_lock_handler.acquire_lock("name", "key")
        d2 = defer.ensureDeferred(lock2.__aenter__())
        # Make sure we haven't acquired the lock yet (`lock1` still holds it)
        self.assertNoResult(d2)

        # Advance time by an hour (some duration that would previously cause our
        # timeout to balloon if it weren't constrained). We step by the lock
        # renewal interval so that `lock1` keeps being renewed and doesn't drop.
        self._pump_by(amount_secs=3600, by_secs=_RENEWAL_INTERVAL_MS / 1000)

        # Make sure we haven't acquired the `lock2` yet (`lock1` still holds it)
        self.assertNoResult(d2)

        # Release the first lock (`lock1`). The second lock(`lock2`) should be
        # automatically acquired by the `pump()` inside `get_success()`
        self.get_success(lock1.__aexit__(None, None, None))

        # We should now have the lock
        self.successResultOf(d2)

    def test_missed_notification_is_retried_within_cap(self) -> None:
        """
        A waiter must re-poll at least every WORKER_LOCK_MAX_RETRY_INTERVAL_SECS
        (plus jitter), however long it has been waiting.

        Before the GHSA-8q93-326v-3m7g fix the retry interval doubled without a
        cap, so after an hour of contention a waiter only re-polled every ~45
        minutes and relied entirely on being notified. Here the holder releases
        the underlying lock *without* notifying (as when a notification is lost),
        and the waiter must still pick it up within the capped interval.
        """
        lock1 = self.worker_lock_handler.acquire_lock("name", "key")
        self.get_success(lock1.__aenter__())

        lock2 = self.worker_lock_handler.acquire_lock("name", "key")
        d2 = defer.ensureDeferred(lock2.__aenter__())
        self.assertNoResult(d2)

        self._pump_by(amount_secs=3600, by_secs=_RENEWAL_INTERVAL_MS / 1000)
        self.assertNoResult(d2)

        # Release the DB lock behind the handler's back: no notification.
        self.get_success(lock1._inner_lock.__aexit__(None, None, None))

        # Sentinel: without a re-poll the waiter has not noticed yet.
        self.reactor.advance(0)
        self.assertNoResult(d2)

        # Within one capped interval (+10% jitter) the waiter must re-poll.
        self._pump_by(
            amount_secs=WORKER_LOCK_MAX_RETRY_INTERVAL_SECS * 1.1 + 1, by_secs=1
        )
        self.successResultOf(d2)
        self.get_success(lock2.__aexit__(None, None, None))

    def test_wait_for_lock_locally(self) -> None:
        """Test waiting for a lock on a single worker"""

        lock1 = self.worker_lock_handler.acquire_lock("name", "key")
        self.get_success(lock1.__aenter__())

        lock2 = self.worker_lock_handler.acquire_lock("name", "key")
        d2 = defer.ensureDeferred(lock2.__aenter__())
        self.assertNoResult(d2)

        self.get_success(lock1.__aexit__(None, None, None))

        self.get_success(d2)
        self.get_success(lock2.__aexit__(None, None, None))


class WorkerLockWorkersTestCase(BaseMultiWorkerStreamTestCase):
    def prepare(
        self, reactor: MemoryReactor, clock: Clock, homeserver: HomeServer
    ) -> None:
        self.main_worker_lock_handler = self.hs.get_worker_locks_handler()

    def test_wait_for_lock_worker(self) -> None:
        """Test waiting for a lock on another worker"""

        worker = self.make_worker_hs(
            "synapse.app.generic_worker",
            extra_config={
                "redis": {"enabled": True},
            },
        )
        worker_lock_handler = worker.get_worker_locks_handler()

        lock1 = self.main_worker_lock_handler.acquire_lock("name", "key")
        self.get_success(lock1.__aenter__())

        lock2 = worker_lock_handler.acquire_lock("name", "key")
        d2 = defer.ensureDeferred(lock2.__aenter__())
        self.assertNoResult(d2)

        self.get_success(lock1.__aexit__(None, None, None))

        self.get_success(d2)
        self.get_success(lock2.__aexit__(None, None, None))
