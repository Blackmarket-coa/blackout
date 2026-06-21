"""Public, no-auth read endpoint for Blackout creator profiles.

Registers ``GET /_blackout/v1/profile/{user_id}`` which serves the *opt-in
public* slice of a user's ``co.bmc.profile`` Matrix account data. This backs
the public creator "character sheet" at ``theblackout.app/@handle`` and is
deliberately session-less: anyone (logged in or not) can read a profile the
owner has marked ``public: true``.

Only an allow-listed set of fields is ever returned, and contact connections
(``email`` / ``phone``) are stripped so they can never leak through the public
surface. Wiring:

  * homeserver.yaml (see apps/blackout-server/docs/homeserver.blackbox.yaml)::

        modules:
          - module: blackout_modules.public_profile.PublicProfileModule
            config: {}

  * The ``blackout_modules`` package must be importable inside the Synapse
    image — add ``COPY blackout_modules ./blackout_modules`` to
    apps/blackout-server/services/blackout-server/Dockerfile before
    ``pip install .`` (it sits alongside ``blackout_runtime``).

  * nginx must route ``/_blackout`` to the Synapse upstream. In
    infra/nginx/sites-available/theblackout.app.conf extend the existing
    Synapse location regex, e.g.::

        location ~ ^(/_matrix/(client|media|identity|static)|/_synapse/client|/_blackout) {
            ... proxy_pass http://blackout_synapse; ...
        }

  * Rebuild::

        docker build -f apps/blackout-server/services/blackout-server/Dockerfile \
            -t blackout-synapse:stable . \
            && cd /opt/blackout-infra \
            && docker compose up -d --force-recreate synapse
"""

from __future__ import annotations

from typing import Any, Mapping

from twisted.web.resource import Resource

from synapse.http.site import SynapseRequest
from synapse.http.server import DirectServeJsonResource
from synapse.types import JsonDict

#: Account data event type that holds a member's extended Blackout profile.
BMC_PROFILE_ACCOUNT_DATA_TYPE = "co.bmc.profile"

#: Fields safe to expose on the public profile surface. Everything else in
#: ``co.bmc.profile`` (wall settings, top friends, theme, status, ...) stays
#: private regardless of the ``public`` flag.
PUBLIC_PROFILE_FIELDS = (
    "bio",
    "pronouns",
    "banner",
    "connections",
    "decoration",
    "public",
    "badgeIds",
    "sponsors",
    "featuredCanopies",
)

#: Connection kinds that must never be published, even when listed by the user.
PRIVATE_CONNECTION_TYPES = frozenset({"email", "phone"})


def _apply_cors(request: SynapseRequest) -> None:
    """Make the endpoint readable from any origin and briefly cacheable."""
    request.setHeader(b"Access-Control-Allow-Origin", b"*")
    request.setHeader(b"Access-Control-Allow-Methods", b"GET, OPTIONS")
    request.setHeader(b"Access-Control-Allow-Headers", b"Content-Type")
    request.setHeader(b"Cache-Control", b"public, max-age=60")


def _public_view(content: Mapping[str, Any]) -> JsonDict:
    """Project stored account data down to the public allow-list."""
    view: JsonDict = {}
    for field in PUBLIC_PROFILE_FIELDS:
        if field not in content:
            continue
        value = content[field]
        if field == "connections" and isinstance(value, list):
            value = [
                conn
                for conn in value
                if not (
                    isinstance(conn, Mapping)
                    and conn.get("type") in PRIVATE_CONNECTION_TYPES
                )
            ]
        view[field] = value
    return view


class PublicProfileResource(DirectServeJsonResource):
    """Leaf resource that resolves a single user's public profile."""

    def __init__(self, module_api: Any, user_id: str):
        super().__init__()
        self._module_api = module_api
        self._user_id = user_id

    async def _async_render_OPTIONS(
        self, request: SynapseRequest
    ) -> tuple[int, JsonDict]:
        _apply_cors(request)
        return 200, {}

    async def _async_render_GET(self, request: SynapseRequest) -> tuple[int, JsonDict]:
        _apply_cors(request)

        if not self._user_id:
            return 404, {"errcode": "M_NOT_FOUND", "error": "Profile not found"}

        content = await self._module_api.account_data_manager.get_global(
            self._user_id, BMC_PROFILE_ACCOUNT_DATA_TYPE
        )

        if not isinstance(content, Mapping) or content.get("public") is not True:
            return 404, {"errcode": "M_NOT_FOUND", "error": "Profile not found"}

        return 200, {"user_id": self._user_id, "profile": _public_view(content)}


class PublicProfileRootResource(Resource):
    """Routes ``/_blackout/v1/profile/{user_id}`` to a per-user leaf resource."""

    isLeaf = False

    def __init__(self, module_api: Any):
        super().__init__()
        self._module_api = module_api

    def getChild(self, path: bytes, request: SynapseRequest) -> Resource:
        del request
        # Twisted percent-decodes the path segment for us, so a request to
        # /_blackout/v1/profile/@alice:theblackout.app arrives here as the raw
        # Matrix user id.
        user_id = path.decode("utf-8") if path else ""
        return PublicProfileResource(self._module_api, user_id)


class PublicProfileModule:
    """Synapse module exposing the public creator profile endpoint."""

    def __init__(self, config: JsonDict, api: Any):
        self._config = config
        self._api = api
        self._api.register_web_resource(
            "/_blackout/v1/profile", PublicProfileRootResource(self._api)
        )

    @staticmethod
    def parse_config(config: JsonDict) -> JsonDict:
        # No options today; accept and pass through whatever is provided so the
        # `config:` block in homeserver.yaml stays forward-compatible.
        return config or {}
