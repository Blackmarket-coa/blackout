#
# This file is licensed under the Affero General Public License (AGPL) version 3.
#
# Copyright (C) 2026 Element Creations Ltd
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# See the GNU Affero General Public License for more details:
# <https://www.gnu.org/licenses/agpl-3.0.html>.
#
# Ported by hand from upstream Synapse 1.157.2 (GHSA-fp53-rw9v-hcf9) into the
# Blackout fork. Upstream parses this section with a pydantic `ParseModel`,
# which this 1.98-based tree does not have; the same defaults and bounds are
# enforced by hand here. See apps/blackout-server/PATCHES.md.

from typing import Any, Union

import attr

from synapse.types import JsonDict

from ._base import Config, ConfigError


@attr.s(slots=True, frozen=True, auto_attribs=True)
class PushRulesLimitsConfig:
    # Chosen arbitrarily, but with the rough rationale that a user
    # might have on the order of 10k rooms and want to set a push rule override for each one.
    rule_count: int = 10_000

    # Chosen arbitrarily, but with the rationale that room IDs are allowed to be up to 255 bytes
    # and they are often used in rule IDs.
    rule_id_length: int = 300

    # Chosen arbitrarily, but with the rationale that real-world push rules don't get
    # nearly this big in practice.
    # Even 512 bytes would probably have been fine, but we should leave space for the use cases
    # of push rules to grow in the future.
    rule_size: int = 1024


def _strict_int(value: Any, name: str, minimum: int) -> int:
    # `bool` is a subclass of `int`; reject it as pydantic's StrictInt does.
    if type(value) is not int:  # noqa: E721
        raise ConfigError(
            f"Could not validate configuration: must be an integer, got {value!r}",
            path=("push_rules", "limits", name),
        )
    if value < minimum:
        raise ConfigError(
            f"Could not validate configuration: must be >= {minimum}, got {value}",
            path=("push_rules", "limits", name),
        )
    return value


def _byte_size(value: Union[int, str], name: str, minimum: int) -> int:
    try:
        size = Config.parse_size(value)
    except (TypeError, ValueError) as e:
        raise ConfigError(
            f"Could not validate configuration: {e}",
            path=("push_rules", "limits", name),
        ) from e
    return _strict_int(size, name, minimum)


class PushRulesConfig(Config):
    section = "push_rules"

    def read_config(self, config: JsonDict, **kwargs: Any) -> None:
        raw_config = config.get("push_rules")
        if raw_config is None:
            raw_config = {}
        if not isinstance(raw_config, dict):
            raise ConfigError("must be a mapping", path=("push_rules",))

        raw_limits = raw_config.get("limits")
        if raw_limits is None:
            raw_limits = {}
        if not isinstance(raw_limits, dict):
            raise ConfigError("must be a mapping", path=("push_rules", "limits"))

        defaults = PushRulesLimitsConfig()
        self.limits = PushRulesLimitsConfig(
            rule_count=_strict_int(
                raw_limits.get("rule_count", defaults.rule_count), "rule_count", 0
            ),
            rule_id_length=_strict_int(
                raw_limits.get("rule_id_length", defaults.rule_id_length),
                "rule_id_length",
                1,
            ),
            rule_size=_byte_size(
                raw_limits.get("rule_size", defaults.rule_size), "rule_size", 1
            ),
        )
