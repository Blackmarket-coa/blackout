# Copyright 2026 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import argparse
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from typing import Callable, List, Mapping, Optional, Sequence, Tuple


def _env_bool(value: Optional[str], default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def run_readiness_checks(
    env: Mapping[str, str],
    *,
    connector: Callable[..., socket.socket] = socket.create_connection,
) -> List[str]:
    enabled = _env_bool(env.get("BLACKOUT_MANAGED_READINESS_CHECKS"), True)
    if not enabled:
        return []

    retries = int(env.get("BLACKOUT_READINESS_RETRIES", "10"))
    timeout = float(env.get("BLACKOUT_READINESS_TIMEOUT_SEC", "5"))
    delay = float(env.get("BLACKOUT_READINESS_DELAY_SEC", "1"))

    targets = [
        ("postgres", env.get("DATABASE_HOST"), int(env.get("DATABASE_PORT", "5432"))),
        ("redis", env.get("REDIS_HOST"), int(env.get("REDIS_PORT", "6379"))),
    ]

    errors: List[str] = []
    for service, host, port in targets:
        if not host:
            errors.append(f"missing {service} host configuration")
            continue

        success = False
        last_error = ""
        for _ in range(retries):
            try:
                with connector((host, port), timeout=timeout):
                    success = True
                    break
            except OSError as exc:
                last_error = str(exc)
                time.sleep(delay)

        if not success:
            errors.append(
                f"{service} readiness check failed for {host}:{port} after {retries} "
                f"attempt(s): {last_error}"
            )

    return errors


def run_verification_hooks(
    env: Mapping[str, str],
    *,
    runner: Callable[..., subprocess.CompletedProcess] = subprocess.run,
) -> List[str]:
    errors: List[str] = []
    hooks: Sequence[Tuple[str, str, str]] = (
        (
            "backup",
            env.get("BLACKOUT_BACKUP_VERIFY_HOOK", ""),
            "BLACKOUT_BACKUP_HOOK_REQUIRED",
        ),
        (
            "restore",
            env.get("BLACKOUT_RESTORE_VERIFY_HOOK", ""),
            "BLACKOUT_RESTORE_HOOK_REQUIRED",
        ),
    )

    for hook_name, hook_cmd, required_flag in hooks:
        if not hook_cmd.strip():
            continue

        required = _env_bool(env.get(required_flag), False)
        proc = runner(
            hook_cmd,
            shell=True,
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            message = (
                f"{hook_name} verification hook failed (rc={proc.returncode}): "
                f"{proc.stderr.strip() or proc.stdout.strip() or 'no output'}"
            )
            if required:
                errors.append(message)
            else:
                print(f"[managed-hosting] warning: {message}")

    return errors


def check_health_endpoint(url: str, timeout: float = 5.0) -> Optional[str]:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            code = getattr(response, "status", response.getcode())
            if code < 200 or code >= 300:
                return f"health endpoint returned status {code}"
        return None
    except urllib.error.URLError as exc:
        return f"health endpoint request failed: {exc}"


def _parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Managed-hosting readiness utilities")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("readiness")
    sub.add_parser("run-hooks")

    health = sub.add_parser("health")
    health.add_argument("--url", required=True)
    health.add_argument("--timeout", type=float, default=5.0)

    return parser.parse_args(argv)


def main(argv: Sequence[str]) -> int:
    args = _parse_args(argv)

    if args.command == "readiness":
        errors = run_readiness_checks(os.environ)
        if errors:
            print("[managed-hosting] readiness checks failed:")
            for error in errors:
                print(f" - {error}")
            return 1
        print("[managed-hosting] readiness checks passed.")
        return 0

    if args.command == "run-hooks":
        errors = run_verification_hooks(os.environ)
        if errors:
            print("[managed-hosting] verification hooks failed:")
            for error in errors:
                print(f" - {error}")
            return 1
        print("[managed-hosting] verification hooks passed.")
        return 0

    if args.command == "health":
        err = check_health_endpoint(args.url, args.timeout)
        if err:
            print(f"[managed-hosting] health check failed: {err}")
            return 1
        print("[managed-hosting] health check passed.")
        return 0

    raise ValueError(f"Unsupported command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
