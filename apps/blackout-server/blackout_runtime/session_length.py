"""Server-enforced session lengths for the Black Mask chat panel.

Launch-plan step B3 (``docs/black-mask-chat-panel-and-account-link.md``,
section 3): someone signing in inside the panel picks how long that sign-in
lasts, and the length is enforced here, on the homeserver, so a client that
ignores or tampers with its own timer is cut off anyway.

How a session gets its length. The panel signs in through the ordinary
``/login`` (or ``/register``), then, before it keeps or uses the new tokens,
calls ``POST /_synapse/client/blackout/session/length`` with the new access
token and ``{"session_length": "<choice>"}``. That call, in one database
transaction:

* records the choice against the token's device (once: a device's length can
  never be replaced, extended or cleared afterwards);
* caps ``access_tokens.valid_until_ms`` for every token of that device at the
  session end, so Synapse's own token check refuses them after it (401
  ``M_UNKNOWN_TOKEN``) on every endpoint except logout;
* caps ``refresh_tokens.expiry_ts`` and ``refresh_tokens.ultimate_session_expiry_ts``
  for that device, so ``/refresh`` refuses after the end and every access token
  it mints before then is capped at the end too (upstream Synapse already
  enforces both columns; this only sets them per device);
* invalidates the cached token lookups, so the cap applies from the next
  request on every worker.

At the session end a sweep on the main process deletes the device: Synapse's
normal sign-out of a device, which removes its access and refresh tokens, its
end-to-end encryption keys and its pushers. Between the end and the sweep the
token caps above already refuse every request.

``until_sign_out`` records the choice and adds no expiry: the session lasts
until the device signs out or the homeserver's own token settings end it.

The whole feature is off unless the module config sets
``session_lengths_enabled: true``. Off, nothing here is mounted, registered or
scheduled, and the module behaves exactly as before. It also stays off when
Synapse delegates authentication to MAS (MSC3861): access tokens then live in
MAS, not in Synapse's ``access_tokens`` table, so they could not be capped here.
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any, List, Mapping, Optional, Tuple

from twisted.web.resource import Resource

from synapse.api.errors import Codes, SynapseError
from synapse.http.server import DirectServeJsonResource
from synapse.http.site import SynapseRequest
from synapse.types import JsonDict

if TYPE_CHECKING:  # pragma: no cover - typing only
    from synapse.storage.database import LoggingTransaction
    from synapse.types import Requester

logger = logging.getLogger(__name__)

HOUR_MS = 60 * 60 * 1000
DAY_MS = 24 * HOUR_MS

#: The only lengths a session may be given. ``None`` means no added expiry.
SESSION_LENGTHS_MS: Mapping[str, Optional[int]] = {
    "1h": HOUR_MS,
    "1d": DAY_MS,
    "7d": 7 * DAY_MS,
    "30d": 30 * DAY_MS,
    "until_sign_out": None,
}

#: Display order, shortest first. Kept in step with ``SESSION_LENGTHS_MS``.
SESSION_LENGTH_ORDER: Tuple[str, ...] = ("1h", "1d", "7d", "30d", "until_sign_out")

TABLE = "blackout_session_lengths"

ALREADY_SET_ERRCODE = "CO.BMC.SESSION_LENGTH_ALREADY_SET"

DEFAULT_SWEEP_INTERVAL_S = 60
MIN_SWEEP_INTERVAL_S = 5
MAX_SWEEP_INTERVAL_S = 3600
SWEEP_BATCH_SIZE = 500

assert set(SESSION_LENGTH_ORDER) == set(SESSION_LENGTHS_MS)


class SessionLengthAlreadySet(Exception):
    """The device already has a recorded session length."""


def session_lengths_requested(config: Mapping[str, Any]) -> bool:
    """True only for a literal YAML ``true``: ``"false"`` must not switch it on."""
    return config.get("session_lengths_enabled", False) is True


def delegated_auth_enabled(hs: Any) -> bool:
    """True when Synapse delegates authentication to MAS (MSC3861)."""
    try:
        return bool(hs.config.experimental.msc3861.enabled)
    except AttributeError:
        return False


def sweep_interval_ms(config: Mapping[str, Any]) -> int:
    raw = config.get("session_length_sweep_interval_s", DEFAULT_SWEEP_INTERVAL_S)
    if isinstance(raw, bool) or not isinstance(raw, int):
        raw = DEFAULT_SWEEP_INTERVAL_S
    return max(MIN_SWEEP_INTERVAL_S, min(MAX_SWEEP_INTERVAL_S, raw)) * 1000


def parse_session_length_body(raw: bytes) -> str:
    """Return the requested length, or raise a 400.

    The body must be exactly ``{"session_length": "<one of SESSION_LENGTHS_MS>"}``:
    no other keys, no other types, no case or whitespace variants.
    """
    if not raw:
        raise SynapseError(400, "Request body must be JSON", Codes.NOT_JSON)
    try:
        body = json.loads(raw)
    except (UnicodeDecodeError, ValueError) as exc:
        raise SynapseError(400, "Request body must be JSON", Codes.NOT_JSON) from exc
    if not isinstance(body, dict):
        raise SynapseError(400, "Request body must be a JSON object", Codes.BAD_JSON)
    if set(body.keys()) != {"session_length"}:
        raise SynapseError(
            400,
            "Request body must contain exactly one field, 'session_length'",
            Codes.INVALID_PARAM,
        )
    value = body["session_length"]
    if not isinstance(value, str) or value not in SESSION_LENGTHS_MS:
        raise SynapseError(
            400,
            "session_length must be one of: " + ", ".join(SESSION_LENGTH_ORDER),
            Codes.INVALID_PARAM,
        )
    return value


class SessionLengthStore:
    """The ``blackout_session_lengths`` table, in Synapse's own database.

    It lives next to ``access_tokens`` and ``refresh_tokens`` (rather than in
    the module's sqlite file) so that recording a length and capping that
    device's tokens happen in one transaction, and so every worker sees it.
    """

    def __init__(self, store: Any) -> None:
        self._store = store
        self._schema_ready = False

    async def ensure_schema(self) -> None:
        if self._schema_ready:
            return

        def _create_txn(txn: "LoggingTransaction") -> None:
            txn.execute(
                f"CREATE TABLE IF NOT EXISTS {TABLE} ("
                " user_id TEXT NOT NULL,"
                " device_id TEXT NOT NULL,"
                " session_length TEXT NOT NULL,"
                " created_ts BIGINT NOT NULL,"
                " expires_ts BIGINT,"
                " PRIMARY KEY (user_id, device_id))"
            )
            txn.execute(
                f"CREATE INDEX IF NOT EXISTS {TABLE}_expires_ts ON {TABLE} (expires_ts)"
            )

        def _probe_txn(txn: "LoggingTransaction") -> None:
            txn.execute(f"SELECT 1 FROM {TABLE} WHERE 1 = 0")

        try:
            await self._store.db_pool.runInteraction(
                "blackout_session_lengths_schema", _create_txn
            )
        except Exception:
            # Two processes creating the table at once can collide on Postgres;
            # that is fine as long as the table exists afterwards.
            await self._store.db_pool.runInteraction(
                "blackout_session_lengths_schema_probe", _probe_txn
            )
        self._schema_ready = True

    async def bind(
        self,
        *,
        user_id: str,
        device_id: str,
        session_length: str,
        now_ms: int,
        expires_ms: Optional[int],
    ) -> None:
        """Record the length and cap the device's tokens, atomically.

        Raises:
            SessionLengthAlreadySet: the device already has a length.
        """
        await self.ensure_schema()
        store = self._store

        def _bind_txn(txn: "LoggingTransaction") -> None:
            txn.execute(
                f"SELECT 1 FROM {TABLE} WHERE user_id = ? AND device_id = ?",
                (user_id, device_id),
            )
            if txn.fetchone() is not None:
                raise SessionLengthAlreadySet()
            txn.execute(
                f"INSERT INTO {TABLE}"
                " (user_id, device_id, session_length, created_ts, expires_ts)"
                " VALUES (?, ?, ?, ?, ?)",
                (user_id, device_id, session_length, now_ms, expires_ms),
            )
            if expires_ms is None:
                return

            txn.execute(
                "SELECT token FROM access_tokens WHERE user_id = ? AND device_id = ?",
                (user_id, device_id),
            )
            tokens = [row[0] for row in txn.fetchall()]
            txn.execute(
                "UPDATE access_tokens SET valid_until_ms = ?"
                " WHERE user_id = ? AND device_id = ?"
                " AND (valid_until_ms IS NULL OR valid_until_ms > ?)",
                (expires_ms, user_id, device_id, expires_ms),
            )
            for column in ("expiry_ts", "ultimate_session_expiry_ts"):
                txn.execute(
                    f"UPDATE refresh_tokens SET {column} = ?"
                    " WHERE user_id = ? AND device_id = ?"
                    f" AND ({column} IS NULL OR {column} > ?)",
                    (expires_ms, user_id, device_id, expires_ms),
                )
            # Synapse caches token lookups (with their expiry) per token; drop
            # them here, and on every other worker, so the cap applies from the
            # very next request.
            for token in tokens:
                store._invalidate_cache_and_stream(
                    txn, store.get_user_by_access_token, (token,)
                )

        try:
            await store.db_pool.runInteraction(
                "blackout_session_length_bind", _bind_txn
            )
        except SessionLengthAlreadySet:
            raise
        except Exception as exc:
            # A concurrent bind for the same device loses on the primary key.
            if await self.get(user_id=user_id, device_id=device_id) is not None:
                raise SessionLengthAlreadySet() from exc
            raise

    async def get(
        self, *, user_id: str, device_id: str
    ) -> Optional[Tuple[str, Optional[int]]]:
        await self.ensure_schema()

        def _get_txn(txn: "LoggingTransaction") -> Optional[Tuple[str, Optional[int]]]:
            txn.execute(
                f"SELECT session_length, expires_ts FROM {TABLE}"
                " WHERE user_id = ? AND device_id = ?",
                (user_id, device_id),
            )
            row = txn.fetchone()
            if row is None:
                return None
            return str(row[0]), (None if row[1] is None else int(row[1]))

        return await self._store.db_pool.runInteraction(
            "blackout_session_length_get", _get_txn
        )

    async def expired(self, *, now_ms: int, limit: int) -> List[Tuple[str, str]]:
        await self.ensure_schema()

        def _expired_txn(txn: "LoggingTransaction") -> List[Tuple[str, str]]:
            txn.execute(
                f"SELECT user_id, device_id FROM {TABLE}"
                " WHERE expires_ts IS NOT NULL AND expires_ts <= ?"
                " ORDER BY expires_ts ASC LIMIT ?",
                (now_ms, limit),
            )
            return [(str(row[0]), str(row[1])) for row in txn.fetchall()]

        return await self._store.db_pool.runInteraction(
            "blackout_session_length_expired", _expired_txn
        )

    async def forget(self, *, user_id: str, device_id: str) -> None:
        await self.ensure_schema()

        def _forget_txn(txn: "LoggingTransaction") -> None:
            txn.execute(
                f"DELETE FROM {TABLE} WHERE user_id = ? AND device_id = ?",
                (user_id, device_id),
            )

        await self._store.db_pool.runInteraction(
            "blackout_session_length_forget", _forget_txn
        )

    async def forget_if_device_gone(self, *, user_id: str, device_id: str) -> None:
        await self.ensure_schema()

        def _forget_txn(txn: "LoggingTransaction") -> None:
            txn.execute(
                f"DELETE FROM {TABLE} WHERE user_id = ? AND device_id = ?"
                " AND NOT EXISTS ("
                "  SELECT 1 FROM devices WHERE devices.user_id = ? AND devices.device_id = ?"
                " )",
                (user_id, device_id, user_id, device_id),
            )

        await self._store.db_pool.runInteraction(
            "blackout_session_length_forget_if_gone", _forget_txn
        )


class SessionLengthService:
    """Binds, reports and ends session lengths. Built only when enabled."""

    def __init__(self, module_api: Any, *, sweep_interval_ms: int) -> None:
        self._module_api = module_api
        self._clock = module_api._clock
        self._store = SessionLengthStore(module_api._store)
        self._device_handler = module_api._device_handler
        self.sweep_interval_ms = sweep_interval_ms

    @classmethod
    def from_config(
        cls, config: Mapping[str, Any], module_api: Any
    ) -> Optional["SessionLengthService"]:
        if not session_lengths_requested(config):
            return None
        if delegated_auth_enabled(getattr(module_api, "_hs", None)):
            logger.warning(
                "blackout_runtime: session_lengths_enabled is set, but this homeserver"
                " delegates authentication (MSC3861), so access tokens cannot be capped"
                " here. Panel session lengths stay unavailable."
            )
            return None
        return cls(module_api, sweep_interval_ms=sweep_interval_ms(config))

    def register(self) -> None:
        """Hook the sweep and the logout cleanup into Synapse."""
        self._module_api.register_password_auth_provider_callbacks(
            on_logged_out=self.on_logged_out
        )
        # Device deletion needs the main process's DeviceHandler, which is not
        # necessarily where background tasks run, so schedule everywhere and
        # let ``sweep_expired`` act only where it can.
        self._module_api.looping_background_call(
            self.sweep_expired,
            self.sweep_interval_ms,
            desc="blackout_session_length_sweep",
            run_on_all_instances=True,
        )

    @staticmethod
    def _requester_device(requester: "Requester") -> Tuple[str, str]:
        user_id = requester.user.to_string()
        if (
            requester.is_guest
            or requester.app_service is not None
            or requester.device_id is None
            or requester.authenticated_entity != user_id
        ):
            raise SynapseError(
                403,
                "A session length can only be set by a user's own signed-in device",
                Codes.FORBIDDEN,
            )
        return user_id, requester.device_id

    async def bind(self, requester: "Requester", session_length: str) -> JsonDict:
        user_id, device_id = self._requester_device(requester)
        now_ms = self._clock.time_msec()
        length_ms = SESSION_LENGTHS_MS[session_length]
        expires_ms = None if length_ms is None else now_ms + length_ms
        try:
            await self._store.bind(
                user_id=user_id,
                device_id=device_id,
                session_length=session_length,
                now_ms=now_ms,
                expires_ms=expires_ms,
            )
        except SessionLengthAlreadySet:
            raise SynapseError(
                409,
                "This session's length is already set and cannot be changed",
                ALREADY_SET_ERRCODE,
            )
        return {
            "device_id": device_id,
            "session_length": session_length,
            "expires_at_ms": expires_ms,
        }

    async def describe(self, requester: "Requester") -> JsonDict:
        user_id, device_id = self._requester_device(requester)
        found = await self._store.get(user_id=user_id, device_id=device_id)
        return {
            "device_id": device_id,
            "session_length": None if found is None else found[0],
            "expires_at_ms": None if found is None else found[1],
        }

    def lengths(self) -> JsonDict:
        return {"session_lengths": list(SESSION_LENGTH_ORDER)}

    async def sweep_expired(self) -> int:
        """Sign out every device whose session has ended. Returns how many."""
        from synapse.handlers.device import DeviceHandler

        if not isinstance(self._device_handler, DeviceHandler):
            return 0
        now_ms = self._clock.time_msec()
        ended = await self._store.expired(now_ms=now_ms, limit=SWEEP_BATCH_SIZE)
        count = 0
        for user_id, device_id in ended:
            try:
                await self._device_handler.delete_devices(user_id, [device_id])
                await self._store.forget(user_id=user_id, device_id=device_id)
                count += 1
            except Exception:
                logger.exception(
                    "blackout_runtime: could not sign out device %s of %s at the end"
                    " of its session; will retry on the next sweep",
                    device_id,
                    user_id,
                )
        return count

    async def on_logged_out(
        self, user_id: str, device_id: Optional[str], access_token: str
    ) -> None:
        """Forget a device's length once the device itself is gone.

        Runs inside every logout, so it must never raise.
        """
        del access_token
        if not device_id:
            return
        try:
            await self._store.forget_if_device_gone(
                user_id=user_id, device_id=device_id
            )
        except Exception:
            logger.exception(
                "blackout_runtime: could not clear the session length of %s/%s",
                user_id,
                device_id,
            )


def _read_body(request: SynapseRequest) -> bytes:
    content = getattr(request, "content", None)
    if content is None:
        return b""
    content.seek(0)
    return content.read()


class SessionLengthsResource(DirectServeJsonResource):
    """``GET /_synapse/client/blackout/session/lengths`` — unauthenticated.

    Tells a sign-in screen which lengths this homeserver enforces. It exists
    only while the feature is enabled, so a 404 means "not enforced here".
    """

    def __init__(self, service: SessionLengthService) -> None:
        super().__init__()
        self._service = service

    async def _async_render_GET(self, request: SynapseRequest) -> Tuple[int, JsonDict]:
        del request
        return 200, self._service.lengths()


class SessionLengthResource(DirectServeJsonResource):
    """``GET`` / ``POST /_synapse/client/blackout/session/length`` — the
    calling device's own session length."""

    def __init__(self, module_api: Any, service: SessionLengthService) -> None:
        super().__init__()
        self._module_api = module_api
        self._service = service

    async def _async_render_GET(self, request: SynapseRequest) -> Tuple[int, JsonDict]:
        requester = await self._module_api.get_user_by_req(request)
        return 200, await self._service.describe(requester)

    async def _async_render_POST(self, request: SynapseRequest) -> Tuple[int, JsonDict]:
        requester = await self._module_api.get_user_by_req(request)
        session_length = parse_session_length_body(_read_body(request))
        return 200, await self._service.bind(requester, session_length)


class SessionRootResource(Resource):
    """``/_synapse/client/blackout/session``."""

    isLeaf = False

    def __init__(self, module_api: Any, service: SessionLengthService) -> None:
        super().__init__()
        self.putChild(b"lengths", SessionLengthsResource(service))
        self.putChild(b"length", SessionLengthResource(module_api, service))
