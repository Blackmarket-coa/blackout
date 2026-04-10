# Copyright 2026 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from typing import List
from unittest.mock import Mock

from synapse.util.blackout_profiles import apply_profile_overrides
from synapse.util.managed_hosting import check_health_endpoint, run_readiness_checks


def run_hosting_smoke_checks() -> List[str]:
    errors: List[str] = []

    # Standalone profile should preserve client+federation resources.
    config = {}
    updated = apply_profile_overrides(
        config, profile="standalone", port=8008, public_baseurl=""
    )
    resources = updated["listeners"][0]["resources"][0]["names"]
    if resources != ["client", "federation", "health"]:
        errors.append(
            "standalone profile resources diverged from expected "
            "['client', 'federation', 'health']"
        )

    # Managed readiness should produce fail-fast diagnostics when deps are unreachable.
    env = {
        "DATABASE_HOST": "db.example",
        "REDIS_HOST": "redis.example",
        "BLACKOUT_READINESS_RETRIES": "1",
        "BLACKOUT_READINESS_TIMEOUT_SEC": "0.1",
        "BLACKOUT_READINESS_DELAY_SEC": "0",
    }
    connector = Mock(side_effect=OSError("connection refused"))
    readiness_errors = run_readiness_checks(env, connector=connector)
    if len(readiness_errors) < 2:
        errors.append("managed readiness smoke did not emit expected fail-fast diagnostics")

    # Health endpoint smoke: serve a local 200 endpoint and verify checker passes.
    health_error = _run_local_healthcheck_smoke()
    if health_error:
        errors.append(health_error)

    return errors


def _run_local_healthcheck_smoke() -> str:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # type: ignore[override]
            if self.path != "/health":
                self.send_response(404)
                self.end_headers()
                return
            self.send_response(200)
            self.end_headers()

        def log_message(self, format: str, *args: object) -> None:
            return

    server = HTTPServer(("127.0.0.1", 0), Handler)
    host, port = server.server_address

    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        error = check_health_endpoint(f"http://{host}:{port}/health", timeout=2.0)
        if error:
            return f"health smoke check failed: {error}"
        return ""
    finally:
        server.shutdown()
        thread.join(timeout=2)
