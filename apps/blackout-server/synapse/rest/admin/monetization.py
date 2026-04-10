# Copyright 2026 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from http import HTTPStatus
from typing import TYPE_CHECKING, Tuple

from synapse.api.errors import SynapseError
from synapse.http.servlet import RestServlet, parse_json_object_from_request
from synapse.http.site import SynapseRequest
from synapse.monetization.service import MonetizationService
from synapse.rest.admin._base import admin_patterns
from synapse.types import JsonDict

if TYPE_CHECKING:
    from synapse.server import HomeServer


class MonetizationWebhookRestServlet(RestServlet):
    PATTERNS = admin_patterns("/monetization/webhook$")

    def __init__(self, hs: "HomeServer"):
        self._clock = hs.get_clock()
        self._service = MonetizationService(
            hs.get_datastores().main, hs.config.monetization.billing_provider
        )
        self._shared_secret = hs.config.monetization.billing_webhook_secret

    async def on_POST(self, request: SynapseRequest) -> Tuple[int, JsonDict]:
        if not self._shared_secret:
            raise SynapseError(
                HTTPStatus.SERVICE_UNAVAILABLE,
                "Monetization webhook secret is not configured",
            )

        provided_secret = request.getHeader("X-Blackout-Webhook-Secret")
        if provided_secret != self._shared_secret:
            raise SynapseError(HTTPStatus.UNAUTHORIZED, "Invalid webhook secret")

        payload = parse_json_object_from_request(request)
        processed, entitlement = await self._service.process_webhook_payload(
            payload, self._clock.time_msec()
        )
        return HTTPStatus.OK, {
            "processed": processed,
            "user_id": entitlement.user_id,
            "tier": entitlement.tier.value,
            "status": entitlement.status.value,
            "source_event_id": entitlement.source_event_id,
        }
