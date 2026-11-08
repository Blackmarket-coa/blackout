# Coalition Field Operations — Minimum Viable Product

**Status:** Proposed MVP definition, not a shipped-feature claim  
**Date:** 2026-11-03  
**Companions:** [Field Operations Build Plan](COALITION_FIELD_OPERATIONS_BUILD_PLAN.md) · [Habit & Participation Strategy](BLACKOUT_HABIT_AND_PARTICIPATION_STRATEGY.md)

## One-sentence promise

**A small, trusted Coalition can see what help is needed, who has volunteered, what resources are available, and whether an operation is progressing—without continuously tracking anyone's location.**

The MVP proves useful coordination, not a full command-and-control or force-tracking platform. It must work for a neighborhood aid drive, pantry delivery, volunteer cleanup, or local mutual-aid response.

## Who it is for

- **Member/volunteer:** Find an appropriate need, volunteer, update status, and check out.
- **Coordinator/ops team:** Create and manage an operation, assign tasks, see manual statuses, and verify resource availability.
- **Steward:** Manage membership and permissions, review sensitive reports, and handle escalations.
- **Public visitor (optional):** View explicitly public resource listings or calls for help, never member status, private operations, or personal location.

## Golden-path demo

1. A Steward creates an **invite-only Coalition** and adds three volunteers.
2. A coordinator creates an operation: **“Deliver pantry supplies Saturday”**, with a description, approximate service area, time window, and two tasks.
3. The coordinator marks a depot **stocked** and a delivery vehicle **available**, with a **last verified** time.
4. A member sees a task and taps **“I'm going”**. Their manual status changes to **en route** (no GPS request).
5. The member marks **on site**, then **complete/off**; the coordinator sees the timestamp and whether the status is stale.
6. The coordinator marks the operation **complete** and records a short after-action note: what was delivered, what remains, and next steps.
7. A nonmember or member of a different Coalition cannot retrieve the operation, volunteer status, or private resource details—even by calling the API directly.

**Definition of success:** The entire journey can be completed on mobile and desktop with clear authorization and no live-position collection.

## MVP scope: must ship

| Capability | Minimum behavior | Acceptance test |
| --- | --- | --- |
| Coalition authorization | Objects belong to one Coalition; roles and audiences enforced on the server | Cross-coalition reads/writes and unauthorized subscriptions are rejected |
| Membership and roles | Existing Coalition membership mapped to member, ops, and Steward privileges | Revoking membership removes access; no reliance on hidden UI alone |
| Operation record | Title, purpose, time window, approximate area, coordinator, state: planned/active/complete | Valid state transitions and authorization are tested |
| Task and volunteer slots | Create task, assign/claim slot, release it, and show assignee/count | Two users cannot silently claim the same exclusive slot |
| Manual status board | Available, en route, on site, needs relief, off; timestamps and stale indicators | User can change/clear status without sharing GPS |
| Resource/asset board | Type, approximate place, stock state (stocked/low/out), capacity optional, hours optional, last verified | Old/unverified data is visibly marked; restricted records stay private |
| Map + list fallback | Show authorized operation area and resource pins; usable non-map list | No sensitive data appears through public tile, search, or API endpoints |
| Closeout note | Coordinator completes operation and records outcome/remaining needs | Closed operation remains viewable only to authorized audience |
| Reliability and safety | Clear errors, offline indication, delivery/decryption failures, audit of privileged changes | Failures are not silently shown as successful updates |

Reuse the existing Matrix/Coalition/map/task components where they pass audit. Avoid duplicate data models or new infrastructure without need.

## Audience and access rules

Define an audience on each operation, task, resource, and status record: **public, coalition, ops team, Stewards only**. Statuses are **never public**. Default new operations and resources to coalition-only; sensitive resources can be ops/Stewards-only. Enforce read/write checks against verified Coalition membership and role/power-level mapping on the backend; verify actual Matrix authorization semantics and any divergence between Matrix and API role stores.

| Data | Default visibility | Who can modify |
| --- | --- | --- |
| Operation title/area | Coalition | Coordinator/Steward |
| Tasks and claimed slots | Coalition | Coordinator; member can claim/release own slot |
| Member manual status | Ops team + the member | Member for self; Steward may mark as stale/escalated, not impersonate |
| Resource stock/location | Coalition, optionally restricted | Authorized resource editor/coordinator |
| After-action note | Coalition | Coordinator/Steward |
| Public call for help | Public only after explicit publish action | Coordinator/Steward |

No public directory of participants. Consider whether even manual statuses reveal sensitive involvement; show the minimum detail needed.

## MVP interface: four surfaces

1. **Operations:** Cards with state, time, approximate area, coordinator, and task progress; create/detail/closeout flow.
2. **Tasks & status:** Task claim/release, volunteer slots, one-tap manual status, freshness timestamps; role-appropriate status board.
3. **Resources:** Map and list of depots, vehicles, shelters, pantry points, and tools; stock state, verification age, basic details.
4. **Steward controls:** Membership/role checks, visibility settings, revocation, and audit/error review.

On mobile, prioritize a one-tap “I'm going” action and legible task/status updates. The map is useful, but the workflow must remain usable if tiles fail.

## Explicitly not in MVP

- Continuous GPS tracking, background location collection, or persistent location history.
- Exact-position live dots, geofencing, proximity push alerts, and route playback.
- Polygon drawing or full route optimization; an existing circular area is sufficient initially.
- LoRa/mesh networking, offline synchronization, and downloadable tile packs.
- Automated dead-man escalation or emergency dispatch.
- Complex field-report verification/reputation, financial rewards, gamified streaks, and public leaderboards.
- Blackstar live integration, cross-Coalition shared operations, or automated supply inventory synchronization.
- Fully automated public discovery or unrestricted open-join field operations.

These are later phases, subject to independent safety and technical gates.

## Pre-build blockers (must be checked, not assumed)

1. **Re-audit scoping:** Earlier review reported server-global pins/events/rings and missing Matrix power-level authorization in API routes. If still present, fix before releasing private operations.
2. **Verify deployment:** Confirm whether Coalition networking is actually deployed and what environment will host the MVP.
3. **Encryption reliability:** Reproduce/resolve BO-1 `DecryptionError` where relevant; do not claim a secure operational workflow when updates may fail silently.
4. **Map privacy:** Verify MapLibre style/tile configuration and third-party tile leakage. Prefer self-hosted or privacy-controlled tiles; do not put sensitive coordinates in third-party map requests.
5. **Threat model and retention:** Define logs, caches, notification content, backups, deletion, and device compromise limitations; state them plainly to users.

## PR-sized delivery plan

| PR | Scope | Merge gate |
| --- | --- | --- |
| **MVP-00** | Current-code audit, threat model update, permission matrix, deployment check | Written evidence of what exists and blockers |
| **MVP-01** | Coalition ownership and server-side authorization on relevant API queries/mutations | Cross-Coalition and revoked-member tests pass |
| **MVP-02** | Operation schema, states, and basic create/detail/list UI | State and permission tests pass |
| **MVP-03** | Task/slot claim/release and manual status model | Concurrency, stale-state, and permission tests pass |
| **MVP-04** | Resource/asset schema, stock state, verification time, map/list UI | No sensitive map or API leakage; stale labels correct |
| **MVP-05** | Closeout notes, error visibility, accessibility and mobile polish | Golden path passes in test environment |
| **MVP-06** | Pilot rollout, monitoring, feedback, documentation | Release gates and rollback plan approved |

PR numbers are proposed labels, not existing GitHub PRs. Implementation should use existing modules/contracts wherever appropriate.

## Release gates

- **Security:** Zero known unauthorized cross-Coalition access; permissions verified at API and subscription boundaries.
- **Privacy:** No GPS permission required for the MVP; no plaintext member position history; map requests and logs reviewed.
- **Reliability:** Operations, claims, and statuses confirm persistence; decryption/network failures are visible; retry behavior is defined.
- **Usability:** Golden path works on supported mobile and desktop browsers; accessible list fallback when map is unavailable.
- **Operational readiness:** Hosted environment confirmed, backups/retention documented, basic monitoring and rollback tested.
- **Pilot:** At least one real, consented small-group operation completes, with observed usability issues logged and resolved or explicitly accepted.

## Product metrics for the pilot

Track operation completion, task acceptance and fulfillment, stale statuses, resource verification freshness, permission failures, errors, and user-reported coordination usefulness. Do not measure success by GPS sharing or total screen time. Collect only necessary telemetry and avoid exposing individual volunteers in analytics.

## What a successful MVP feels like

A volunteer opens Blackout, sees a nearby community need **by chosen Coalition/area rather than background GPS**, taps **“I'm going”**, checks in manually, and helps complete the job. A coordinator knows which tasks are covered and which resources are available. A Steward trusts that sensitive information stays inside the intended group. The team can close the operation and learn from it.

**MVP boundary:** Coordinate people and resources first. Consider live location only after the no-GPS workflow proves useful and the security/reliability gates are met.
