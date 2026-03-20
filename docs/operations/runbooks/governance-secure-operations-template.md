# Governance Secure Operations Template (Day 2 Must-Have)

Use this template when rolling out governance-heavy rooms so coordination remains fast, understandable, and privacy-safe.

## 1) Governance interaction acceleration defaults

- **Searchability**
  - Enable proposal search on title + body.
  - Publish a weekly room index post that links to active proposals by state (`draft`, `discuss`, `amend`, `close`, `decide`).
- **Proposal state visibility**
  - Keep state filter visible at all times in governance rooms.
  - Include `Visible proposals: X / Y` counters in moderator dashboards.
- **Thread clarity**
  - Require each proposal to contain a one-line summary at top of body.
  - Use lifecycle helper copy (`draft -> discuss -> amend -> close -> decide`) in the proposal detail panel.

## 2) Civic cadence defaults (anti-addiction posture)

- Default digest cadence: **daily**.
- Default decision window: **48h**.
- Engagement loop protection: **always on** (no streak mechanics, no urgency nudges, no dopamine loop badges).

## 3) WO-3 / WO-7 safety controls

### Expiry semantics validation (dead-drop)
- Confirm room auto-expiry indicators are shown in message views.
- Validate local redaction runs after expiry in test/staging rooms.
- Verify rollback path exists in feature preset controls (`stego_toolkit`, `ephemeral_stego_lifecycle`).

### Anti-abuse and latency bounds (timing policy)
- Enforce bounded randomized delay policy with documented min/max ceilings.
- Validate anti-amplification limits are active for carriers/chunks.
- Confirm operator override exists for urgent incident channels.

## 4) WO-5 cell/chapter boundary confidence checklist

- Re-run chapter visibility tests: chapter-local rooms must not leak to non-members.
- Re-run shared broadcast channel checks: only explicitly shared channels cross chapter boundaries.
- Re-run compromise-containment scenario: verify blast radius remains chapter-scoped.

## 5) Operator-ready room template

```yaml
governance_room_profile:
  cadence:
    digest_mode: daily
    decision_window_hours: 48
    engagement_loop_protection: true
  visibility:
    state_filter_default: all
    search_scope: title_and_body
  privacy_controls:
    dead_drop_expiry_enabled: true
    timing_obfuscation:
      enabled: true
      min_delay_ms: 150
      max_delay_ms: 1200
  boundary_controls:
    chapter_local_default: true
    explicit_shared_channels_only: true
```
