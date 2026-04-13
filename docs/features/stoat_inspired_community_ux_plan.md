# Stoat-inspired community UX plan for Blackout (no Stoat runtime deps)

## Scope and constraints

This plan applies Stoat-inspired interaction patterns while preserving Blackout's Matrix-first architecture.

**Hard constraints kept:**
- No Stoat runtime/package imports.
- Matrix room/space semantics remain source of truth.
- Blackout terminology is retained in labels and copy.
- Keyboard navigation and accessibility behaviors remain first-class.

---

## 1) Wireframe-level route map

### Navigation shell model

- **Primary shell:**
  - Left rail: coalition/space switcher (`m.space` roots).
  - Mid rail: dense room/channel discovery for selected space.
  - Main pane: timeline or feature view.
  - Right panel: role-rich member surfaces and moderation context.
  - Global top utilities: search, quick switcher, inbox, account.

### Route map (wireframe level)

| Route | Purpose | Matrix semantics under hood | Notes |
|---|---|---|---|
| `/app` | Home shell redirect | remembers last active `spaceId` + `roomId` | fast resume |
| `/app/space/:spaceId` | Community overview | space summary via `m.space.child` graph | shows announcements + activity |
| `/app/space/:spaceId/discover` | Dense channel discovery | child room list + join rules + member counts | filters/sorts + keyboard list nav |
| `/app/space/:spaceId/room/:roomId` | Channel timeline | Matrix room timeline and state | default collaboration view |
| `/app/space/:spaceId/room/:roomId/threads/:eventId` | Thread focus | `m.thread` relations | right/stacked thread context |
| `/app/space/:spaceId/members` | Member directory | joined members + power levels | role, presence, trust signals |
| `/app/space/:spaceId/members/:userId` | Member profile surface | member events + room relationship | moderation + role actions |
| `/app/space/:spaceId/onboarding` | Guided onboarding flow | `co.bmc.onboarding` + room/space capabilities | resumable, step-stateful |
| `/app/space/:spaceId/settings/community` | Community settings | space state + policy events | owner/admin only |
| `/app/inbox` | Cross-room notifications | unread markers + mentions | triage-first workflows |
| `/app/search` | Global search | indexed room events | scoped by coalition/space |

### Focus order + keyboard continuity

- Preserve current landmark structure (`header` → `nav` rails → `main` → complementary panel).
- Keep roving-tab-index patterns for room/member virtualized lists.
- Every new dense list item supports:
  - `Enter`: open,
  - `Cmd/Ctrl+Enter`: open in split/panel,
  - `Arrow` keys: traverse,
  - typeahead on visible list.

---

## 2) Component inventory

### A. Community-first navigation shell

1. **`CommunityShellFrame`**
   - Owns 4-region layout and responsive collapse rules.
2. **`SpaceCoalitionRail`**
   - Space switcher with unread and trust badges.
3. **`CommunityContextHeader`**
   - Space identity, quick actions, safety posture.
4. **`GlobalCommandSurface`**
   - Quick switcher, global search, create actions.

### B. Denser channel discovery

5. **`ChannelDiscoveryGrid`**
   - Compact list/group view with category chips.
6. **`ChannelRowDense`**
   - Single-row channel card with activity, privacy, role gate indicators.
7. **`DiscoveryFilterBar`**
   - Filter by type, access, activity, and role eligibility.
8. **`DiscoverySortMenu`**
   - Sort by recency, relevance, member count, and “new to you”.
9. **`JoinPreviewPanel`**
   - Inline room preview before joining/opening.

### C. Role-rich member surfaces

10. **`MemberDirectoryPanel`**
    - Presence groups, role facets, and trust markers.
11. **`MemberCardRich`**
    - Role chips, moderation status, shared rooms, participation stats.
12. **`MemberProfileSheet`**
    - Expanded profile with governance + moderation actions.
13. **`RoleContextStrip`**
    - At-a-glance role hierarchy and permission hints.
14. **`ModerationActionDock`**
    - Contextual actions (warn, timeout, remove, audit link).

### D. Onboarding flow improvements

15. **`OnboardingJourneyRouter`**
    - Step routing, persistence, skip/resume logic.
16. **`OnboardingProgressMap`**
    - Visual step map with completion + blockers.
17. **`StepWelcomeAndNorms`**
    - Community tone, safety norms, expectations.
18. **`StepIdentityAndRoles`**
    - Role selection/request and profile basics.
19. **`StepChannelPathfinder`**
    - Suggested channels by role/intent.
20. **`StepFirstContribution`**
    - Guided first post/reply/reaction action.

### Existing primitives to reuse first

- `SpaceTree` / space hierarchy data adapters.
- Right-panel member/grouping logic.
- Existing onboarding state event hooks (`co.bmc.onboarding`).
- Existing quick switcher search patterns.

---

## 3) Migration sequence (low-risk first)

### Phase 0 — Foundation hardening (lowest risk)

1. **Instrument before redesign**
   - Add telemetry around discovery clicks, join conversions, onboarding drop-offs.
2. **Introduce feature flags**
   - Guard new shell, dense discovery, member surfaces, onboarding v2 independently.
3. **Add adapter layer**
   - Normalize room/space/member view models without changing current UI.

**Exit criteria:** no visual changes, stable metrics baseline.

### Phase 1 — Navigation shell scaffolding

4. Ship `CommunityShellFrame` behind opt-in flag.
5. Keep existing room list component mounted inside new frame (parity mode).
6. Validate keyboard traversal and landmarks in CI accessibility checks.

**Risk profile:** low (layout-level, minimal behavior change).

### Phase 2 — Dense channel discovery

7. Add `discover` route and render read-only discovery list first.
8. Enable filters/sorts; keep default ranking equal to current ordering initially.
9. Add join/open actions once event and permission parity is validated.

**Risk profile:** low-medium (new surface, existing semantics).

### Phase 3 — Role-rich member surfaces

10. Replace member list panel with `MemberDirectoryPanel` using existing member data hooks.
11. Add `MemberProfileSheet` actions progressively (view-only → moderator actions).
12. Roll out role facets per space cohort to validate performance at large member counts.

**Risk profile:** medium (state density + moderation actions).

### Phase 4 — Onboarding v2 journey

13. Introduce `OnboardingJourneyRouter` as wrapper around current wizard data.
14. Ship progressive step modules with resume checkpoints.
15. Add role/channel recommendations driven by space metadata and power-level policies.

**Risk profile:** medium (first-run critical path; needs careful A/B).

### Phase 5 — Default switch + cleanup

16. Promote flags to default after KPI and accessibility sign-off.
17. Remove deprecated shell/onboarding paths.
18. Publish operator playbook for rollback toggles by feature area.

**Risk profile:** medium-high only at default switch; mitigated by independent rollback flags.

---

## 4) Accessibility and interaction invariants (must not regress)

- All interactive controls remain reachable via keyboard only.
- Visible focus indicators preserved in dense layouts.
- ARIA labels updated when icon density increases.
- Virtualized member/channel lists expose count, position, and selection state to assistive tech.
- Onboarding steps support skip, back, save-and-exit, and resume without pointer use.

---

## 5) Stoat-inspired but Blackout-native visual direction

- Use Stoat-like density, panel hierarchy, and discovery cues.
- Keep Blackout naming conventions (e.g., coalition, community, channel, governance) in all labels.
- Avoid direct visual cloning: preserve Blackout token system, spacing scale, and trust/safety semantics.
