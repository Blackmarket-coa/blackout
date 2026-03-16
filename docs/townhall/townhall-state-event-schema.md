# Townhall Matrix state-event schema

Defines stable room-state events for Blackout townhall policy and role overrides.

## Event types

- `m.widget` (state key = widget id): widget configuration and URL metadata.
- `im.blackout.townhall.policy` (state key = ""):
  - `publisherCap`: number
  - `publishLock`: boolean
  - `sessionId`: string
  - `agendaId`: string
- `im.blackout.townhall.roles` (state key = userId):
  - `role`: `host|moderator|speaker|listener`
  - `actor`: matrix user id
  - `reason`: short code
  - `updatedAt`: ms epoch

## Validation rules

1. Only users with `events_default` override for these state events can write policy/role state.
2. Effective role is resolved as `Host > Moderator > Speaker > Listener`.
3. `publishLock=true` blocks publish grants for non-host/non-moderator users.

## Compatibility

- Legacy `im.vector.modular.widgets` is still honored by the client store for safe migration.
- New deployments should prefer `m.widget` as canonical widget event.
