# Blackout Blocker Decision Record (BLK-117)

Date: 2026-02-27  
Facilitator: Architecture Council

## Decisions

1. **Blocked events policy**
   - Decision: **hard reject** blocked timeline payload events (`m.room.message`, `m.room.encrypted`) with explicit `403` errors and blackout-specific errcodes.
2. **Compatibility mode for existing Matrix clients**
   - Decision (updated 2026-03-18): **strict mode** (no transitional payload compatibility path once blackout mode is enabled).
3. **Federation-safe signaling schema baseline**
   - Decision (updated 2026-03-18): richer schema baseline with strict server-side validation, explicit versioning (`schema_version = 2`), and required `message_metadata.content_class`.
4. **TURN default policy**
   - Decision: default recommendation is external `coturn`; on-device TURN is opt-in for constrained deployments.
5. **Retention default**
   - Decision (updated 2026-03-18): default signaling retention is `72h` (within 24–72h policy) with compliance controls aligned to that window.

## Implementation linkage

- Write-path hard rejects for blocked payload types are implemented in local and federated ingress.
- Migration toggle alias (`blackout_signaling_only_mode`) is wired to blackout mode enablement.
- Schema validation for `m.blackout.signal` is enforced server-side before event acceptance.

## Follow-ups

- ✅ Published compatibility matrix for legacy clients: `docs/development/blackout_client_compatibility_matrix.md`.
- ✅ Published TURN policy and retention compliance artifacts: `docs/development/blackout_turn_default_policy.md`, `docs/development/blackout_retention_compliance_note.md`.
