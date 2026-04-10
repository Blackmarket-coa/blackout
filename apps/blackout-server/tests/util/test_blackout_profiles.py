# Copyright 2026 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from pathlib import Path

import yaml

from synapse.util.blackout_profiles import (
    apply_profile_overrides,
    determine_profile,
    get_missing_managed_env_vars,
    main,
)

from tests.unittest import TestCase


class BlackoutProfileSelectionTestCase(TestCase):
    def test_explicit_profile_is_deterministic(self) -> None:
        profile, reason = determine_profile({"BLACKOUT_PROFILE": "constrained"})
        self.assertEqual(profile, "constrained")
        self.assertEqual(reason, "explicit BLACKOUT_PROFILE")

    def test_auto_falls_back_to_standalone_when_managed_deps_missing(self) -> None:
        profile, reason = determine_profile({})
        self.assertEqual(profile, "standalone")
        self.assertIn("managed dependencies missing", reason)
        self.assertEqual(
            get_missing_managed_env_vars({}),
            [
                "DATABASE_HOST",
                "DATABASE_PASSWORD",
                "REDIS_HOST",
                "REGISTRATION_SHARED_SECRET",
            ],
        )

    def test_auto_selects_managed_when_dependencies_present(self) -> None:
        profile, reason = determine_profile(
            {
                "DATABASE_HOST": "db",
                "DATABASE_PASSWORD": "pw",
                "REDIS_HOST": "redis",
                "REGISTRATION_SHARED_SECRET": "secret",
            }
        )
        self.assertEqual(profile, "managed")
        self.assertIn("managed dependencies present", reason)


class BlackoutProfileConfigMutationTestCase(TestCase):
    def test_profile_overrides_keep_client_and_federation_resources(self) -> None:
        config = {}
        updated = apply_profile_overrides(
            config,
            profile="standalone",
            port=8008,
            public_baseurl="",
        )
        self.assertEqual(
            updated["listeners"][0]["resources"][0]["names"],
            ["client", "federation", "health"],
        )

    def test_standalone_overrides_for_sqlite_and_health_listener(self) -> None:
        config = {}
        updated = apply_profile_overrides(
            config,
            profile="standalone",
            port=8123,
            public_baseurl="https://example.test/",
        )
        self.assertEqual(updated["database"]["name"], "sqlite3")
        self.assertEqual(updated["redis"]["enabled"], False)
        self.assertEqual(updated["listeners"][0]["port"], 8123)
        self.assertEqual(
            updated["listeners"][0]["resources"][0]["names"],
            ["client", "federation", "health"],
        )

    def test_constrained_adds_conservative_defaults(self) -> None:
        config = {}
        updated = apply_profile_overrides(
            config,
            profile="constrained",
            port=8008,
            public_baseurl="",
        )
        self.assertEqual(updated["caches"]["global_factor"], 0.1)
        self.assertEqual(updated["presence"]["enabled"], False)
        self.assertEqual(updated["max_upload_size"], "10M")

    def test_cli_smoke(self) -> None:
        tmp_path = Path(self.mktemp())
        tmp_path.write_text("server_name: test\n", encoding="utf-8")
        exit_code = main(
            [
                "--config-path",
                str(tmp_path),
                "--profile",
                "standalone",
                "--port",
                "8999",
                "--public-baseurl",
                "https://example.org/",
            ]
        )
        self.assertEqual(exit_code, 0)

        result = yaml.safe_load(tmp_path.read_text(encoding="utf-8"))
        self.assertEqual(result["listeners"][0]["port"], 8999)
        self.assertEqual(result["database"]["name"], "sqlite3")
