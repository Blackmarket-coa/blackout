# Runtime `NotImplementedError` audit (`synapse/`)

## Scope

Command used:

```bash
rg -n "raise NotImplementedError\(" synapse
```

## Disposition summary

- **Category A (valid abstract interface):** 60 occurrences across 22 files.
- **Category B (concrete runtime gap):** 5 call-sites were identified and remediated in this change by implementing behavior or replacing raw `NotImplementedError` with a typed, explicit runtime failure.

## Category B remediations (completed)

| File | Previous behavior | New behavior | Rationale |
|---|---|---|---|
| `synapse/http/servlet.py` | `RestServlet.register` raised raw `NotImplementedError` when subclass did not define `PATTERNS` and did not override `register`. | Raises `TypeError` with clear subclass contract message. | Programming error at registration time should be typed and explicit, not a generic abstract-method sentinel. |
| `synapse/storage/database.py` | `LoggingTransaction.executescript` raised raw `NotImplementedError` on non-sqlite engines. | Raises `RuntimeError` with explicit engine name. | Concrete runtime path; now fails clearly with a typed runtime error. |
| `synapse/util/gai_resolver.py` | `HostResolution.cancel()` raised raw `NotImplementedError`. | `cancel()` is now a safe no-op returning `None`. | Cancellation can be invoked by callers; this should not raise an abstract sentinel. |
| `synapse/storage/schema/main/delta/68/05partial_state_rooms_triggers.py` | Unknown DB engine raised raw `NotImplementedError`. | Raises `RuntimeError` with engine name. | Migration runtime guard should use explicit runtime failure. |
| `synapse/storage/schema/main/delta/74/04_membership_tables_event_stream_ordering_triggers.py` | Unknown DB engine raised raw `NotImplementedError`. | Raises `RuntimeError` with engine name. | Migration runtime guard should use explicit runtime failure. |

## Category A inventory (retained)

All remaining `raise NotImplementedError()` call-sites in `synapse/` are abstract/interface declarations (typically via `abc.ABCMeta` + `@abc.abstractmethod`) or equivalent interface stubs.

- `synapse/api/auth/base.py`
- `synapse/events/__init__.py`
- `synapse/federation/send_queue.py`
- `synapse/federation/sender/__init__.py`
- `synapse/handlers/admin.py`
- `synapse/handlers/oidc.py`
- `synapse/handlers/room_member.py`
- `synapse/handlers/sso.py`
- `synapse/handlers/ui_auth/checkers.py`
- `synapse/http/connectproxyclient.py`
- `synapse/http/server.py`
- `synapse/media/_base.py`
- `synapse/push/__init__.py`
- `synapse/replication/tcp/streams/_base.py`
- `synapse/storage/databases/main/end_to_end_keys.py`
- `synapse/storage/databases/main/keys.py`
- `synapse/storage/databases/main/presence.py`
- `synapse/storage/databases/main/pusher.py`
- `synapse/storage/databases/main/room.py`
- `synapse/storage/databases/main/signatures.py`
- `synapse/storage/util/id_generators.py`
- `synapse/streams/__init__.py`

## Validation expectations

This change includes tests to confirm the Category B runtime paths no longer raise raw `NotImplementedError`.
