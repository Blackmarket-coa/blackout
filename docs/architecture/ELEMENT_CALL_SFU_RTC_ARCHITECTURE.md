# Element Call + SFU RTC Architecture

Status: Proposed (baseline for implementation planning)  
Last updated: 2026-04-09

## 1) Scope and goals

This architecture defines a unified RTC stack using **Element Call clients**, **MatrixRTC signaling**, and an **SFU tier** (LiveKit-compatible) that can support:

1. **1:1 calls** (interactive, low setup latency)
2. **Persistent voice channels** (always-on / drop-in rooms)
3. **Townhall scale mode** (large audience, moderated speaking)

Design goals:
- One signaling/control model across call types.
- No single point of failure across control plane or media plane.
- Predictable quality under packet loss, jitter, and regional outages.
- Explicit policy knobs for bitrate, simulcast/SVC, and role-based permissions.

---

## 2) Reference architecture (logical)

```text
+--------------------+       +-------------------------+
| Element Call (Web) | <---> | Matrix Homeserver       |
| Element Call (App) |       | + MatrixRTC signaling   |
+--------------------+       +-------------------------+
          |                               |
          | ICE + DTLS/SRTP               | room events / membership
          v                               v
   +----------------+         +---------------------------+
   | Global LB/GSLB | <-----> | SFU Control API + Token  |
   +----------------+         | Service (ephemeral JWT)  |
          |                   +---------------------------+
          v
+---------------------------------------------------------------+
| Multi-region SFU Pools (region-a, region-b, region-c)         |
|  - SFU nodes (stateless, horizontally scaled)                 |
|  - Redis/NATS (presence/session state if required by SFU impl) |
|  - RTP ingress/egress over UDP/TCP fallback                   |
+---------------------------------------------------------------+
          |
          v
+--------------------------+
| TURN/STUN (coturn pool)  |
| anycast + regional POPs  |
+--------------------------+
```

### Key principles
- **Matrix remains source-of-truth** for room membership, permissions, and call state metadata.
- **SFU is media switching fabric**, not authority for identity/authorization.
- **Token service is short-lived and scoped** to room + role + media capability.
- **Clients prefer nearest healthy SFU region** but retain deterministic fallback order.

---

## 3) Workload profiles

## 3.1 1:1 calls

### Flow
1. Caller creates/joins MatrixRTC session in room/DM.
2. Both participants obtain short-lived SFU join tokens.
3. Both connect to nearest SFU POP; publish one upstream audio/video stream each.
4. SFU forwards selected layers to peer.

### Media policy (default)
- Audio: Opus, DTX enabled, FEC enabled.
- Video: VP9/VP8/H264 (capability-based), simulcast 2-3 layers.
- Congestion control: TWCC + GCC; per-subscriber adaptive downswitch.

### Capacity assumptions
- Target p95 join time: < 2.5s.
- p95 one-way audio latency: < 180ms intra-region, < 260ms inter-region.
- Typical participant cap per session: 2 (with support for escalation to small group).

## 3.2 Persistent voice channels

### Characteristics
- Room is long-lived; participants churn continuously.
- Audio-first; optional low-FPS video/screen stream for moderators.
- Requires robust idle behavior and reconnection smoothing.

### Flow
- Voice channel represented by stable Matrix room and “active call” state.
- SFU session remains active while channel enabled, even if occupancy drops to zero for a grace window.
- Late joiners attach without re-negotiating room identity model.

### Media policy (default)
- Audio only by default, Opus narrowband/wideband auto.
- VAD-driven active speaker + last-N forwarding (e.g., top 6 speakers).
- Optional push-to-talk role for large channels.

### Capacity assumptions
- Typical room size: 10-200 listeners.
- Active talkers at once: 1-8.
- p95 reconnect recovery after transient network drop: < 4s.

## 3.3 Townhall scale mode

### Characteristics
- Large audience (hundreds to thousands).
- Few publishers (hosts/speakers), many subscribers.
- Strict moderation and deterministic stage controls.

### Topology pattern
- **Stage SFU tier**: ingest host/speaker streams.
- **Edge fanout SFU tier** (optional at >~1k viewers): relay/sub-distribute by region.
- **Role-based subscribe rights**: audience receive-only by default.

### Media policy (default)
- Stage publishers use simulcast/SVC for adaptive audience delivery.
- Audience video may be disabled by policy (audio + slides/screenshare primary).
- Raised-hand queue and moderated unmute handled in control plane.

### Capacity assumptions
- 500+ listeners baseline, burst to 2k with fanout tier.
- Host failover without ending event.
- Join surge control for first 60 seconds of event start.

---

## 4) Media server topology

## 4.1 Regional deployment

Per region:
- 3+ SFU nodes across availability zones.
- Regional TURN pool (N+1) with autoscaling.
- Regional token service replicas behind L7 load balancer.
- Optional regional cache/state bus for SFU coordination.

Global:
- DNS/GSLB latency steering with health checks.
- Hard failover region order embedded in client config.
- Shared telemetry backend with per-region dashboards.

## 4.2 Session placement

Placement key:
- Primary: client RTT and geo.
- Secondary: room affinity (keep participants in same region when feasible).
- Tertiary: SFU node load score (CPU, outbound Mbps, packet loss trend).

For townhall:
- Pin stage publishers to region nearest production/control team.
- Audience routed to nearest fanout pool; stage-to-edge relay over managed backbone.

## 4.3 Network and protocol requirements

- UDP preferred for RTP/RTCP; TCP/TLS fallback for restricted networks.
- TURN over UDP/TCP/TLS (3478/5349 equivalents as policy allows).
- ICE restarts permitted during path migration.
- DSCP marking where enterprise policy/network supports it.

---

## 5) Failover and resiliency design

## 5.1 Failure domains

- Client network failure
- Single SFU node failure
- AZ-local SFU pool degradation
- Regional SFU outage
- Token service/control plane outage
- TURN fleet saturation or reachability loss

## 5.2 Recovery mechanisms

### A) Node-level SFU failure
- Health checks eject node from LB in seconds.
- Clients detect transport loss and trigger ICE restart + rejoin to sibling node.
- For persistent channels, maintain room call state to avoid UX "channel ended" artifacts.

### B) AZ/pool degradation
- Admission controller drains impacted pool.
- New joins redirected to healthy AZ.
- Existing sessions instructed for staggered migration (avoid thundering herd).

### C) Regional outage
- GSLB withdraws region.
- Clients fail over to secondary region from ordered list.
- Token service accepts room-scoped replay-safe reissue for migration window.

### D) Control plane degradation
- Token mint path is multi-replica + cached public keys.
- Graceful token overlap (short) allows in-flight refresh during partial outages.
- If Matrix state delays, media keeps flowing with bounded stale permission window (e.g., 30-60s) before hard revalidation.

## 5.3 Stateful continuity strategy

- Keep SFU mostly stateless; authoritative room role state in Matrix + policy service.
- For townhall, preserve speaker roster/checkpoint in replicated control store.
- Idempotent join/leave and mute commands to tolerate retries.

---

## 6) QoS and congestion controls

## 6.1 Client-side controls

- Device/network preflight (mic/cam permissions, bitrate estimate, TURN reachability).
- Dynamic encode ladder selection by CPU + uplink estimate.
- Automatic fallback ladder:
  1. Disable outbound video
  2. Reduce max receive layers
  3. Audio-only mode

## 6.2 SFU-side controls

- Per-subscriber bandwidth estimator and layer selection.
- Last-N and dominant speaker for audio/video room efficiency.
- Packet pacing + queue limits to avoid bufferbloat.
- NACK + PLI/FIR tuned thresholds; FEC for audio preferred.
- Join rate limiting + backpressure for townhall surges.

## 6.3 Policy tiers by mode

- **1:1**: prioritize low latency and full duplex video.
- **Persistent channel**: prioritize audio intelligibility and reconnect stability.
- **Townhall**: prioritize host stream stability and subscriber fairness over audience uplink.

## 6.4 SLOs and guardrails

Suggested SLOs:
- Session join success: >= 99.5% (5-min windows, per region)
- Audio MOS proxy good-or-better: >= 98% of participant-minutes
- Reconnect success after transient drop (<30s): >= 97%
- Townhall start surge acceptance (first minute): >= 99%

Alert triggers:
- ICE failure spike
- p95 join latency breach
- Outbound packet loss > threshold for host streams
- Token mint error budget burn rate

---

## 7) Security and abuse controls

- Ephemeral SFU tokens (short TTL, audience/speaker role claims, room-scoped).
- Server-side enforcement of publish/subscribe permissions.
- Moderator hard mute and forced stage removal.
- E2EE posture: if full SFU-incompatible E2EE is required, use insertable streams/SFrame with explicit key management tradeoffs.
- Audit logs for moderator actions and policy overrides.

---

## 8) Operational runbook essentials

- Pre-event checklist for townhall: host network, backup host, fallback region readiness.
- Live dashboard: join funnel, active transports, loss/jitter heatmap, top failing ISPs/ASNs.
- Canary deployments for SFU releases with automatic rollback on QoS regression.
- Chaos tests: node kill, AZ drain, regional blackhole, TURN exhaustion simulation.

---

## 9) Implementation blueprint (phased)

1. **Phase 1 (1:1 baseline)**
   - Single SFU tier, regional HA, token service hardening.
2. **Phase 2 (persistent voice channels)**
   - Long-lived room lifecycle, audio-focused optimization, reconnect smoothing.
3. **Phase 3 (townhall scale mode)**
   - Stage roles, audience policy, surge admission controls.
4. **Phase 4 (multi-region fanout + advanced QoS)**
   - Relay tier, cross-region traffic engineering, SLO-driven autoscaling.

This phased path keeps architecture coherent while progressively increasing scale and operational complexity.
