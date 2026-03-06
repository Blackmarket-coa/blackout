# Townhall SFU implementation tickets (phase-8 checklist)

Source: `docs/blackout-sfu-townhall-build-plan.md` section 12.

## Ticket backlog

1. **TOWNHALL-01 — Add townhall widget feature flag in Blackout**
    - Deliverable: checklist item 1.
    - Acceptance: `feature_blackout_townhall` with legacy alias support and test coverage.
2. **TOWNHALL-02 — Implement widget shell and Matrix context binding**
    - Deliverable: checklist item 2.
    - Acceptance: MVP shell receives `roomId/userId/displayName` context and token-connect flow.
3. **TOWNHALL-03 — Implement backend token service with role policy engine**
    - Deliverable: checklist item 3.
    - Acceptance: POST token client/service contract + role-bound response schema + tests.
4. **TOWNHALL-04 — Define and document Matrix state events for townhall policy**
    - Deliverable: checklist item 4.
    - Acceptance: schema doc for policy state + role override events.
5. **TOWNHALL-05 — Provision LiveKit + coturn + TLS endpoint**
    - Deliverable: checklist item 5.
    - Acceptance: staging endpoint provisioned with infra runbook links.
6. **TOWNHALL-06 — Add moderation controls and audit logging**
    - Deliverable: checklist item 6.
    - Acceptance: mute/demote/kick/publish-lock controls with audit trail events.
7. **TOWNHALL-07 — Add observability dashboards/alerts/runbooks**
    - Deliverable: checklist item 7.
    - Acceptance: dashboard JSON + alert rules + operational runbook references.
8. **TOWNHALL-08 — Execute 100/250/500 load test gates**
    - Deliverable: checklist item 8.
    - Acceptance: committed evidence for each profile before wider rollout.
9. **TOWNHALL-09 — Complete security review and rollout signoff**
    - Deliverable: checklist item 9.
    - Acceptance: signed review record with mitigation tracking.

## Current sprint scope

- In-scope MVP: TOWNHALL-01, TOWNHALL-02, TOWNHALL-03.
- Rollout gate for this phase: 100-user load profile evidence (partial execution of TOWNHALL-08).
