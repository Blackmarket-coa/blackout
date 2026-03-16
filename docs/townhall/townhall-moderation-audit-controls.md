# Townhall moderation and audit controls

## Controls

- Mute-all
- Demote speaker to listener
- Remove participant stream
- Kick participant
- Lock/unlock publishing

## Audit event format

`im.blackout.townhall.audit`:

- `actor`: matrix user id
- `target`: matrix user id or room id
- `action`: enum (`mute_all|demote|remove_stream|kick|publish_lock`)
- `reason`: string code
- `ts`: ms epoch

## Enforcement

- Host and moderator roles can execute control actions.
- Audit event emission is required for all privileged actions.
