# Copyright 2026 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from contextlib import contextmanager
from typing import Iterator
from unittest.mock import Mock

from synapse.util.managed_hosting import (
    check_health_endpoint,
    run_readiness_checks,
    run_verification_hooks,
)

from tests.unittest import TestCase


@contextmanager
def _dummy_socket() -> Iterator[object]:
    yield object()


class ManagedHostingReadinessTestCase(TestCase):
    def test_readiness_passes_when_dependencies_are_reachable(self) -> None:
        env = {
            "DATABASE_HOST": "db.example",
            "REDIS_HOST": "redis.example",
            "BLACKOUT_READINESS_RETRIES": "1",
            "BLACKOUT_READINESS_TIMEOUT_SEC": "0.1",
            "BLACKOUT_READINESS_DELAY_SEC": "0",
        }

        connector = Mock(side_effect=lambda *_args, **_kwargs: _dummy_socket())
        errors = run_readiness_checks(env, connector=connector)
        self.assertEqual(errors, [])

    def test_readiness_returns_fail_fast_diagnostics(self) -> None:
        env = {
            "DATABASE_HOST": "db.example",
            "REDIS_HOST": "redis.example",
            "BLACKOUT_READINESS_RETRIES": "1",
            "BLACKOUT_READINESS_TIMEOUT_SEC": "0.1",
            "BLACKOUT_READINESS_DELAY_SEC": "0",
        }

        connector = Mock(side_effect=OSError("connection refused"))
        errors = run_readiness_checks(env, connector=connector)
        self.assertEqual(len(errors), 2)
        self.assertIn("postgres readiness check failed", errors[0])
        self.assertIn("redis readiness check failed", errors[1])

    def test_optional_hook_failure_warns_but_does_not_error(self) -> None:
        env = {
            "BLACKOUT_BACKUP_VERIFY_HOOK": "false",
            "BLACKOUT_BACKUP_HOOK_REQUIRED": "false",
        }

        runner = Mock()
        runner.return_value.returncode = 1
        runner.return_value.stderr = "hook failed"
        runner.return_value.stdout = ""

        self.assertEqual(run_verification_hooks(env, runner=runner), [])

    def test_required_hook_failure_errors(self) -> None:
        env = {
            "BLACKOUT_BACKUP_VERIFY_HOOK": "false",
            "BLACKOUT_BACKUP_HOOK_REQUIRED": "true",
        }

        runner = Mock()
        runner.return_value.returncode = 1
        runner.return_value.stderr = "hook failed"
        runner.return_value.stdout = ""

        errors = run_verification_hooks(env, runner=runner)
        self.assertEqual(len(errors), 1)
        self.assertIn("backup verification hook failed", errors[0])

    def test_health_endpoint_failure_returns_message(self) -> None:
        self.assertIsNotNone(check_health_endpoint("http://127.0.0.1:1/health", 0.1))
