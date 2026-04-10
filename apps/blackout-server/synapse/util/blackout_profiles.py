# Copyright 2026 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Mapping, MutableMapping, Sequence, Tuple

import yaml

REQUIRED_MANAGED_ENV_VARS: Sequence[str] = (
    "DATABASE_HOST",
    "DATABASE_PASSWORD",
    "REDIS_HOST",
    "REGISTRATION_SHARED_SECRET",
)


def determine_profile(env: Mapping[str, str]) -> Tuple[str, str]:
    configured_profile = env.get("BLACKOUT_PROFILE", "").strip().lower()
    if configured_profile:
        if configured_profile not in {"managed", "standalone", "constrained"}:
            raise ValueError(
                "BLACKOUT_PROFILE must be one of: managed, standalone, constrained"
            )
        return configured_profile, "explicit BLACKOUT_PROFILE"

    missing = get_missing_managed_env_vars(env)
    if missing:
        return "standalone", "auto fallback (managed dependencies missing)"

    return "managed", "auto detect (managed dependencies present)"


def get_missing_managed_env_vars(env: Mapping[str, str]) -> Sequence[str]:
    return [var for var in REQUIRED_MANAGED_ENV_VARS if not env.get(var)]


def apply_profile_overrides(
    config: MutableMapping[str, object],
    *,
    profile: str,
    port: int,
    public_baseurl: str,
) -> MutableMapping[str, object]:
    listeners = config.setdefault("listeners", [])
    if not isinstance(listeners, list):
        listeners = []
        config["listeners"] = listeners

    listener: MutableMapping[str, object]
    if listeners and isinstance(listeners[0], dict):
        listener = listeners[0]
    else:
        listener = {}
        listeners.insert(0, listener)

    listener["port"] = port
    listener["bind_addresses"] = ["0.0.0.0"]
    listener["tls"] = False
    listener["type"] = "http"
    listener["x_forwarded"] = True
    listener["resources"] = [{"names": ["client", "federation", "health"], "compress": False}]

    # Keep startup deterministic and healthcheck-friendly by using a single
    # listener in profiles that generate local config.
    config["listeners"] = [listener]

    if public_baseurl:
        config["public_baseurl"] = public_baseurl

    config.setdefault("suppress_key_server_warning", True)

    if profile in {"standalone", "constrained"}:
        config["database"] = {"name": "sqlite3", "args": {"database": "/data/homeserver.db"}}
        config["redis"] = {"enabled": False}

    if profile == "constrained":
        # Conservative defaults for low-resource environments.
        config["caches"] = {"global_factor": 0.1}
        config["presence"] = {"enabled": False}
        config["max_upload_size"] = "10M"

    return config


def _parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Apply Blackout profile config overrides")
    parser.add_argument("--config-path", required=True)
    parser.add_argument("--profile", required=True, choices=["managed", "standalone", "constrained"])
    parser.add_argument("--port", required=True, type=int)
    parser.add_argument("--public-baseurl", default="")
    return parser.parse_args(argv)


def main(argv: Sequence[str]) -> int:
    args = _parse_args(argv)
    config_path = Path(args.config_path)
    with config_path.open("r", encoding="utf-8") as f:
        config = yaml.safe_load(f) or {}

    if not isinstance(config, dict):
        raise ValueError("homeserver config must be a YAML mapping")

    apply_profile_overrides(
        config,
        profile=args.profile,
        port=args.port,
        public_baseurl=args.public_baseurl,
    )

    with config_path.open("w", encoding="utf-8") as f:
        yaml.safe_dump(config, f, sort_keys=False)

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
