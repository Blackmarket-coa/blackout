# Coalition Field Operations: Privacy-First Build Plan

**Status:** Proposed; implementation and deployment require current-code verification.  
**Source baseline:** Review notes describing Blackout `develop` as of 2026-11-02; no runtime test was performed.  
**Product connection:** [Blackout Habit & Participation Strategy](BLACKOUT_HABIT_AND_PARTICIPATION_STRATEGY.md).

## Goal

Extend Coalition's map-first coordination experience into useful, privacy-preserving field operations: status, supplies, operations, check-ins, verified reports, and eventually carefully scoped, optional live location. Prefer useful coordination without tracking people.

## Reported existing capabilities (verify against current code)

- Coalition shell uses a Matrix room and `co.bmc.coalition` state event, with 12 tabs and map-first navigation.
- MapLibre map reportedly has 15 layers (including aid, needs, resources, infrastructure, and events), heat overlay, and animated “live” pins. **Animated pins are not evidence of live member tracking.**
- Place model distinguishes `pin` and circular `area` with radius.
- Flash-sale ephemeral pins reportedly purge after one hour.
- Two-step location opt-in reportedly coarsens position to approximately 1 km before transmission and returns only a count.
- Related features include dead-man switch, release keys, tasks, events, RSVPs, and volunteer slots.
- Current-position acquisition reportedly uses `getCurrentPosition` once per load; no continuous location sharing was identified in the reviewed code.
- Mesh/LoRa relay architecture is documented as proposed.

These are **reported findings, not independently re-audited implementation guarantees**. Re-check the latest branch, configuration, and deployments before treating them as current.

## Gating audit: permissions, location privacy, and reliability

**P0 / Phase 0: Revalidate scope and access controls.** Earlier Task 0 notes reportedly found pins, events, and rings server-global instead of coalition-scoped, and API routes not authorizing against Matrix power levels. Verify whether this is still true. Before exposing new field data, define object ownership, membership authorization, and explicit audience levels: **public / coalition / ops team / Stewards only**. Apply server-side authorization on every read, write, subscription, export, and notification; do not rely on client-side layer visibility. Test cross-coalition access and membership revocation.

Additional release gates:
- Verify BO-1 (`DecryptionError`) resolution and user-visible failure handling. Encrypted check-ins or alerts must not fail silently.
- Confirm whether the Coalition network is deployed; the September audit reportedly said coded but not deployed.
- Verify Matrix client + homeserver support for encrypted live-location events, retention, key rotation, and revoked access before selecting that transport.
- Replace third-party default map tile/style requests with a controlled/self-hosted option for sensitive use. If `VITE_MAPLIBRE_STYLE_URL` is unset, audit whether fallback requests disclose viewed map regions to public OSM services.
- Review the threat model: homeserver metadata visibility, device seizure exclusions, server logs, backups, push notifications, and client caches. Encryption is not a promise of zero metadata or zero retained copies.

## Phased implementation, in dependency order

### Phase 1 — Status board (no GPS)

Members can set **available / en route / on site / needs relief / off** for a coalition operation, with a timestamp and optional expiry. Connect to tasks and volunteer slots. Scope access to authorized audiences; provide an explicit opt-out, manual override, and stale-state indication. Never infer availability from device movement.

**PR-sized slices:**
1. Authorization contract, audience model, cross-coalition access tests.
2. Status schema/API or authorized Matrix event contract with expiry semantics.
3. Status board UI linked to tasks and volunteer slots; accessibility and audit tests.

**Acceptance:** Members can update/revoke status, authorized users see freshness, unauthorized users cannot read or infer status, and stale entries do not appear current.

### Phase 2 — Assets and supplies (not people)

Add typed resources: trucks, pantry routes, depots, shelters, tool libraries, and supply points. Track **stocked / low / out**, capacity, hours, and **last verified** timestamp. Show uncertainty and verification source. Define an optional future integration contract for Blackstar micro-depots, without implying that integration is live.

**PR-sized slices:**
1. Asset/resource model and per-object authorization.
2. Map layer + list view with freshness and stock/capacity badges.
3. Verification/edit flow and tests for stale or conflicting data.

**Acceptance:** Users can find needed supplies without seeing member locations, and outdated information is visibly flagged.

### Phase 3 — Operation lifecycle

Support **planned / active / complete / after-action review**. Model staging points, routes, and polygon areas in addition to existing circular areas. Enforce role-based transition permissions, visibility, audit trails, and privacy-aware retention.

**PR-sized slices:**
1. Operation schema, state transitions, and authorization tests.
2. Polygon/route drawing and validation; mobile map UX.
3. After-action review and retention/export controls.

**Acceptance:** An authorized team can plan, execute, close, and review an operation without publishing sensitive routes or participant positions.

### Phase 4 — Safety check-ins

Adapt appropriate dead-man-switch patterns for explicit buddy/Steward check-in timers. Specify escalation policy, quiet hours, failure states, notification reliability, and cancellation. **A missed check-in is a prompt to verify safety, not proof of an emergency.**

### Phase 5 — Time-boxed, opt-in live location

Only after Phase 0 gates pass, prototype operation-specific live sharing with chosen audience and automatic expiry. Offer **exact / block / neighborhood** precision choices, defaulting to less precise. Require clear start/stop indicators and revocation. Do not expose live dots in open-join coalitions; prefer invite-only or Steward-approved small cells.

Investigate encrypted Matrix live-location events rather than storing plaintext position in the spatial API. **Do not assume E2EE eliminates server metadata, event retention, recipient copies, device caching, or location inference.** Test encryption support and failure handling end-to-end. No persistent plaintext location history or location-sharing streak incentives.

### Phase 6 — Spot reports

Structured field reports: **what / where / when / how many**, with provenance, independent confirmations, freshness decay, corrections, and role-appropriate visibility. Make unconfirmed reports visibly distinct from verified observations. Avoid publishing sensitive personal details.

### Phase 7 — Offline resilience

Investigate self-hosted/offline map tiles, degraded-network queueing, and compact LoRa status packets. The Mesh/LoRa architecture remains **proposed** until demonstrated. Define reconciliation, replay protection, expiration, and a clear offline/stale UI.

## Safety and privacy defaults

- No persistent server-side plaintext member location history.
- No live tracking in open-join groups; no silent background collection.
- Audience scopes enforced server-side and checked on every request.
- Expire ephemeral sharing and minimize logs, notifications, caches, and backups.
- Explain what E2EE protects and what metadata or endpoint risks remain.
- Never use streaks, social pressure, or rewards to encourage broadcasting location.
- Show decryption, delivery, and connectivity failures explicitly.
- Default to asset, supply, and manually declared status information rather than GPS.

## Engagement hook without surveillance pressure

- **Trigger:** “Needed 0.4 mi from you” — only when the user has explicitly opted into sufficiently precise, time-limited proximity matching; otherwise use a non-distance-based alert.
- **Action:** One-tap “I'm going” to accept a task.
- **Variable reward:** See a team form and a supply drive reach a milestone.
- **Investment:** Standing roles and a record of verified, consented contributions.

Measure completed assistance, reliable check-ins, verified resource availability, successful operations, and user-reported safety—not hours of location broadcasting.

## Open verification checklist

- [ ] Re-audit coalition scoping, pins/events/rings, Matrix power-level authorization.
- [ ] Confirm deployment status and actual feature flags.
- [ ] Reproduce and resolve BO-1 or document safe fallback.
- [ ] Inspect map style/tile URLs, proxying, and third-party leakage.
- [ ] Verify E2EE live-location compatibility, event expiry, device caches, and logs.
- [ ] Threat-model open-join communities, coercion, device compromise, and membership revocation.
- [ ] Implement and test Phase 1–3 before considering continuous position sharing.
