# @blackout/protocol

Canonical cross-runtime contract surface for Blackout feature events.

## Ownership
- **Owner:** `@blackout/protocol`
- **Consumers:** client and server runtimes import event names and payload schemas from this package.

## Surface
- Event names are defined as constants (for governance: `GOVERNANCE_EVENT_NAMES`).
- Payload schemas are defined as TypeScript interfaces in this package.
- Event envelope types are exported for typed transport boundaries.

## Versioning policy
- `*_PROTOCOL_VERSION` constants represent contract version.
- Policy is **additive-only-minor**:
  - add optional fields or new events in minor changes,
  - breaking field removals/renames require a major protocol version update.
