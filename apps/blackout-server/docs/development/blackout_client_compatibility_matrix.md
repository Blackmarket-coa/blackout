# Blackout Client Compatibility Matrix and Migration Recommendation

Date: 2026-02-27  
Owners: Client Liaison + Backend Lead

## Scope

This matrix defines expected behavior for clients when blackout mode is enabled.

## Compatibility matrix

| Client behavior profile | Sends `m.blackout.signal` for transport metadata | Sends `m.room.message` / `m.room.encrypted` payload events | Expected server result in blackout mode | Migration recommendation |
|---|---:|---:|---|---|
| Blackout-native client | Yes | No | Fully compatible. Signaling accepted and retained with TTL policy. | Preferred target profile. |
| Hybrid client (feature-flagged) | Yes | Sometimes | Partial compatibility. Legacy payload events rejected with `403 M_FORBIDDEN`. | Enable blackout transport flag by default before cutover. |
| Legacy Matrix chat client | No | Yes | Incompatible for room timeline payloads under blackout policy. | Keep blackout disabled for these tenants or route to non-blackout homeserver. |

## Client fallback behavior

When clients receive blackout blocking errors (`ORG.BLACKOUT.EVENT_TYPE_BLOCKED`,
`ORG.BLACKOUT.UNSUPPORTED_TIMELINE_TYPE`), clients should:

1. Stop retrying the blocked payload event type.
2. Switch transport to `m.blackout.signal` metadata envelopes.
3. Surface a local UX notice that payload delivery requires blackout-compatible transport.

## Migration recommendation

1. **Pre-cutover stage**
   - Keep `blackout_signaling_only_mode: false`.
   - Ship client updates that emit `m.blackout.signal`.
2. **Canary stage**
   - Enable blackout mode on selected rooms/tenants.
   - Monitor rejection counters for blocked payload event types.
3. **Cutover stage**
   - Enable blackout mode cluster-wide only after rejection rates for legacy payload types are near-zero.
4. **Post-cutover guardrails**
   - Keep explicit user-facing error mapping for `403 M_FORBIDDEN` blocked payload events.

## Operator notes

- Expected blocked types: `m.room.message`, `m.room.encrypted`.
- Use `synapse_blackout_event_rejections_total` and `synapse_blackout_federation_event_rejections_total` to confirm migration progress.
