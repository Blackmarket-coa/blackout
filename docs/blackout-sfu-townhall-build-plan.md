# Blackout SFU Townhall Integration Build Plan

> Scope: Integrate a Matrix-native video townhall experience using an Element widget with LiveKit (SFU) while keeping Matrix homeserver load unchanged.

## 1) Objectives and non-goals

### Objectives

- Support stable large-room broadcasts (initial target: 100–500 concurrent viewers) without peer-to-peer overload.
- Keep Matrix as system-of-record for identity, room membership, moderation, and governance.
- Move all media routing to SFU infrastructure (LiveKit + TURN), decoupled from Synapse/Dendrite.
- Gate all publish permissions by role (speaker/listener/moderator/host) and short-lived token auth.

### Non-goals

- No direct media handling in the Matrix homeserver.
- No replacement of Matrix chat/mod tooling; widget augments room experience.
- No permanent long-lived SFU credentials in the client.

---

## 2) High-level architecture

```text
Matrix Room (E2EE)
  -> Blackout Video Widget (iframe)
  -> Matrix signaling + widget state events
  -> Token service (backend policy check)
  -> LiveKit SFU
  -> Participants
```

### Responsibility split

- Matrix layer:
    - user identity, membership, power levels, moderation actions, chat history, governance process.
- Video layer (LiveKit + coturn):
    - publish/subscribe transport, simulcast layers, adaptive delivery, congestion control.
- Token service:
    - verifies room membership + role policy, mints short-lived LiveKit access tokens.

---

## 3) Role and permission model

Define an explicit role matrix for every townhall room:

- Host:
    - controls broadcast state (open/closed publishing), can promote/demote speakers.
- Moderator:
    - mute/kick/remove stream/lock publish.
- Speaker:
    - `canPublish=true` for audio/video.
- Listener:
    - `canPublish=false`, subscribe-only.

### Mapping to Matrix

- Derive effective role from Matrix room membership + power levels + optional room state event (e.g. `im.blackout.townhall.roles`).
- Resolve conflicts deterministically (e.g. Host > Moderator > Speaker > Listener).

### Safety guardrails

- Global maximum active publishers per room.
- Host/mod-only elevation to speaker.
- Default join role is listener.

---

## 4) Core components to build

## 4.1 Video widget (client)

Create a dedicated townhall widget package/component that:

1. Reads room context from Matrix widget APIs.
2. Requests a short-lived SFU token from Blackout backend.
3. Connects to LiveKit with adaptive stream features enabled.
4. Enforces role-based UX (publish controls only for speakers/hosts/mods).
5. Surfaces moderation controls for authorized roles.

Minimal connect path:

```ts
import { connect } from "livekit-client";

const room = await connect(LIVEKIT_URL, token, {
    adaptiveStream: true,
    dynacast: true,
});
```

## 4.2 Token/auth policy service (backend)

Build a narrow backend API (e.g. `POST /api/townhall/token`) that:

1. Authenticates Matrix user/session.
2. Verifies user currently belongs to room.
3. Resolves effective role and room publish lock state.
4. Issues a 1–5 minute LiveKit token with role-bound grants.
5. Emits audit logs for publish grants, demotions, and moderation actions.

## 4.3 Matrix signaling and state schema

Define stable event/state schema for:

- widget configuration (`m.widget` with townhall metadata),
- townhall policy state (publisher cap, publish lock, active agenda/session id),
- role overrides/escalations,
- moderation action summary events (optional compliance audit trail).

## 4.4 SFU and network edge

- LiveKit node(s) for media forwarding.
- coturn for NAT/firewall traversal.
- Reverse proxy + TLS termination.
- Metrics/log pipeline (Prometheus/Grafana + centralized logs).

---

## 5) Deployment blueprint

## Phase A: single-node launch (pilot)

Deploy on a dedicated media host separate from Matrix homeserver:

- LiveKit
- coturn
- nginx (or equivalent)
- TLS certificates + automated renewal

Use this for controlled pilots and governance rehearsals.

## Phase B: horizontally scaled production

```text
Load Balancer
  -> LiveKit node pool (N nodes)
  -> Redis (shared coordination/state)
```

Scale by:

- adding LiveKit nodes,
- region-aware routing for latency,
- failover policy and drain procedures.

---

## 6) Performance and reliability defaults

### Media defaults

- Enable simulcast for speakers (e.g. 1080p/720p/360p).
- Enable adaptive stream + dynacast.
- Prefer active-speaker/subscription prioritization.

### Hard limits

- max concurrent publishers per room,
- max camera resolution/frame-rate for non-host speakers,
- optional audio-only fallback mode for degraded conditions.

### Availability targets (initial)

- service uptime SLO for townhall media plane,
- p95 join time budget,
- p95 rebuffer/packet-loss thresholds with alerting.

---

## 7) Moderation and governance controls

Expose first-class controls in the widget for authorized roles:

- Mute-all.
- Demote speaker -> listener.
- Remove participant stream.
- Kick participant.
- Lock/unlock publishing room-wide.
- Publisher queue management (waitlist + promote next).

Audit each privileged action with actor, target, timestamp, and reason code.

---

## 8) Security model

- Never expose privileged LiveKit server keys to clients.
- Token TTL: 1–5 minutes; refresh flow with revocation on role downgrade.
- Backend validates room membership and role on every token mint.
- Restrict CORS/origins to Blackout widget hosts.
- Rate-limit token endpoint and moderation endpoints.

Recommended threat checks:

- replayed token reuse,
- publish escalation attempts,
- unauthorized room joins,
- moderation abuse logging gaps.

---

## 9) Delivery phases and milestones

## Milestone 0 — Architecture + ADR (1 week)

- Write ADR for Matrix + LiveKit boundaries.
- Finalize role model and state event schema.
- Define SLOs and observability baseline.

Exit: approved design docs + implementation backlog.

## Milestone 1 — Token service + minimal widget join (1–2 weeks)

- Implement token endpoint with membership/role checks.
- Build widget join flow and listener-only default.
- Validate 25–50 participant internal test.

Exit: authenticated subscribe-only townhall works end-to-end.

## Milestone 2 — Speaker publishing + moderation MVP (1–2 weeks)

- Enable role-based publish grants.
- Ship mute/demote/kick/publish-lock controls.
- Add moderation audit events.

Exit: governed townhall controls functional in staging.

## Milestone 3 — Production hardening (2 weeks)

- Enable simulcast tuning and capacity limits.
- Add load/stress tests (100/250/500 profiles).
- Add dashboards + alerts + incident runbook.

Exit: meets baseline SLOs for initial launch target.

## Milestone 4 — Scale-out readiness (as needed)

- Add multi-node LiveKit + Redis.
- Validate node failure/drain behavior.
- Run game-day exercises.

Exit: horizontal scaling validated for growth events.

---

## 10) Test and validation plan

### Functional

- join/leave, publish/unpublish, speaker promotion/demotion.
- room publish lock behavior.
- moderator action enforcement latency.

### Scale

- load profiles: 100, 250, 500, and stretch 1000 viewers.
- mixed network conditions (packet loss, constrained bandwidth).

### Security

- expired token denial,
- role downgrade revokes publish,
- non-member token request blocked,
- audit trail integrity checks.

### Operational

- rolling restart of LiveKit nodes,
- TURN outage behavior,
- token service degradation fallback.

---

## 11) Suggested initial capacity targets

- Pilot launch: 100 concurrent viewers, 4–8 speakers.
- Early production: 500 concurrent viewers, 8–16 speakers.
- Stretch scenario: 1000 viewers with strict speaker cap and tuned simulcast.

Use observed bitrate/CPU metrics from pilot events to refine codec/layer defaults before wider rollout.

---

## 12) Integration checklist (implementation-ready)

- [x] Add townhall widget feature flag in Blackout.
- [x] Implement widget shell and Matrix context binding.
- [x] Implement backend token service with role policy engine.
- [ ] Define and document Matrix state events for townhall policy.
- [ ] Provision LiveKit + coturn + TLS endpoint.
- [ ] Add moderation controls and audit logging.
- [ ] Add observability dashboards/alerts/runbooks.
- [ ] Execute 100/250/500 load test gates. (100-user gate evidence committed in `docs/operations/evidence/2026-02-20-townhall-100-user-load-gate.md`)
- [ ] Complete security review and rollout signoff.

Implementation tickets: `docs/blackout-sfu-townhall-implementation-tickets.md`.
