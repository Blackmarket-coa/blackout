#
# Tests for the `push_rules` config section added by the hand-port of
# GHSA-fp53-rw9v-hcf9 (upstream Synapse 1.157.2). Upstream validates this
# section with pydantic; this tree validates it by hand, so the parsing gets
# its own tests. See apps/blackout-server/PATCHES.md.
#
from typing import Any

from parameterized import parameterized

from synapse.config import ConfigError
from synapse.config.push_rules import PushRulesConfig

from tests.unittest import TestCase


def _read(raw: Any) -> PushRulesConfig:
    config = PushRulesConfig(root_config=None)
    config.read_config({"push_rules": raw} if raw is not None else {})
    return config


class PushRulesConfigTestCase(TestCase):
    def test_defaults(self) -> None:
        for raw in (None, {}, {"limits": {}}, {"limits": None}):
            limits = _read(raw).limits
            self.assertEqual(limits.rule_count, 10_000)
            self.assertEqual(limits.rule_id_length, 300)
            self.assertEqual(limits.rule_size, 1024)

    def test_overrides_and_size_suffix(self) -> None:
        limits = _read(
            {"limits": {"rule_count": 0, "rule_id_length": 24, "rule_size": "2K"}}
        ).limits
        self.assertEqual(limits.rule_count, 0)
        self.assertEqual(limits.rule_id_length, 24)
        self.assertEqual(limits.rule_size, 2048)

    @parameterized.expand(
        [
            ({"limits": {"rule_count": -1}},),
            ({"limits": {"rule_count": "10"}},),
            ({"limits": {"rule_count": True}},),
            ({"limits": {"rule_id_length": 0}},),
            ({"limits": {"rule_size": 0}},),
            ({"limits": {"rule_size": "lots"}},),
            ({"limits": []},),
            ([],),
        ]
    )
    def test_invalid(self, raw: Any) -> None:
        with self.assertRaises(ConfigError):
            _read(raw)
