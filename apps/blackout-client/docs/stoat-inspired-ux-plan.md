# Stoat-Inspired UX Plan for Blackout (No Stoat Runtime Imports)

## Intent

Design a Stoat-inspired UX layer for `apps/blackout-client` while keeping Blackout’s Matrix-native architecture untouched.

### Hard constraints

- **Do not import Stoat runtime dependencies** (no Stoat SDK/runtime/package coupling).
- Keep **Matrix room/space semantics** as the underlying data model.
- Use **Blackout language** for user-facing labels and copy.
- Preserve and expand **accessibility + keyboard flows**.

---

## 1) Wireframe-level route map (community-first shell)

> Concept: a community hub shell where users orient around communities/spaces first, then rooms/channels, while still mapping cleanly to Matrix spaces/rooms.

## Global shell layout

- **Left rail (Community Rail):** Communities, quick switcher, create/join.
- **Center rail (Discovery + Channel List):** Dense channel index and discovery facets.
- **Main panel (Timeline/Thread/Room view):** Standard Matrix timeline surface.
- **Right panel (Role-rich member + context):** Member cards, role badges, moderation/context actions.

### Route map

| Route | UX purpose | Matrix semantic backing | Primary shell modules |
|---|---|---|---|
| `/home` | Personalized community feed and recent activity | joined spaces + room recents | `navigationShell`, `activitySummary`, `communityRail` |
| `/communities` | Community index (joined + suggested) | spaces + directory discovery | `communityDirectory`, `communityRail` |
| `/communities/:spaceId` | Community hub (overview + channel sections) | `m.space` graph (`m.space.child`) | `communityHub`, `channelDiscoveryDense` |
| `/communities/:spaceId/channels/:roomId` | Channel timeline in community context | room timeline + receipts + membership | `timelineSurface`, `roomHeader`, `quickActions` |
| `/discover/channels` | Dense cross-community channel discovery | public rooms + space-indexed children | `channelDiscoveryDense`, `filterPanel` |
| `/discover/people` | Role-aware member discovery | room members + power levels/profile | `memberDiscovery`, `roleBadges` |
| `/onboarding` | New-user guided setup | account data + join/create flows | `onboardingWizard`, `preferenceCapture` |
| `/onboarding/community` | Guided first community join/create | space join/create + alias resolution | `communityOnboardingStep` |
| `/onboarding/channels` | Guided channel subscription | room membership within selected space | `channelOnboardingStep` |
| `/settings/accessibility` | A11y and keyboard setup | local preferences + account data | `accessibilitySettings`, `keyboardMap` |

### Navigation shell behavior

- Community context is sticky while traversing channels in that community.
- Global quick switcher supports keyboard-first jump:
  - `⌘/Ctrl + K`: open universal switcher
  - `G` then `C`: focus community rail
  - `G` then `D`: focus dense discovery rail
- Fallback path if community context is unavailable: route resolves to room timeline with neutral shell.

---

## 2) Component inventory (plugin/module boundaries)

> All components below are design targets that must be delivered via Blackout modules/plugins only.

| Component | Responsibility | Boundary owner | Extension slot | A11y notes |
|---|---|---|---|---|
| `CommunityRail` | Community-first nav, unread indicators, pinned communities | `src/app/plugins/navigation/*` | `NavigationSlot.registerCommunityRail()` | Roving tabindex, arrow-key navigation, screen-reader labels |
| `CommunityHubHeader` | Community identity, actions, context breadcrumbs | `src/app/features/community-hub/*` | `CommunitySlot.registerHeader()` | Landmark regions + heading hierarchy |
| `ChannelDiscoveryDenseList` | Denser channel scanning with facets/sorting | `src/app/plugins/navigation/*` + `src/app/features/elements/*` | `DiscoverySlot.registerChannelList()` | Virtualized list with announced position/count |
| `DiscoveryFacetPanel` | Filter by category, activity, access model, language | `src/app/features/discovery/*` | `DiscoverySlot.registerFacetPanel()` | Keyboard-toggle chips + clear focus states |
| `RoomQuickActionsBar` | Contextual quick actions in room/timeline header | `src/app/plugins/composer/*`, `src/app/plugins/room-header/*` | `QuickActionSlot.register(...)` | All actions reachable via keyboard shortcuts/menu |
| `RoleRichMemberCard` | Member profile with role badges and trust signals | `src/app/plugins/right-panel/*` + `src/app/features/members/*` | `RightPanelSlot.registerMemberCard()` | Semantic badge labels and contrast-compliant tokens |
| `MemberRoleBadgeSet` | Power-level/role visualization | `src/app/features/members/*` | `MemberSlot.registerBadges()` | Non-color-only role distinction |
| `OnboardingWizardShell` | Multi-step onboarding orchestration | `src/app/features/onboarding/*` | route-managed feature module | Progress semantics + skip/restart controls |
| `CommunityPickStep` | Recommend/join/create first community | `src/app/features/onboarding/*` | `OnboardingSlot.registerStep('community')` | Search input labeling + result announcements |
| `ChannelPickStep` | Recommend channels from selected community | `src/app/features/onboarding/*` | `OnboardingSlot.registerStep('channels')` | Multi-select keyboard support |
| `KeyboardCommandPalette` | Keyboard discoverability and routing | `src/app/plugins/navigation/*` | `NavigationSlot.registerCommandPalette()` | Full shortcut map and focus return behavior |

### Explicit non-goals

- No Stoat runtime package or SDK import.
- No replacement of Matrix transport, sync, event schema, or auth flows.
- No shell-level hardcoding of feature behavior outside documented slots.

---

## 3) Migration sequence (low-risk first)

## Stage 0 — Guardrails (lowest risk)

- Add/confirm lint + CI rule: ban Stoat runtime imports in client path.
- Freeze current shell extension points and publish slot contract doc.
- Add UX contract tests for focus management and keyboard routing.

**Exit criteria:** guardrails active, no UX behavior changes yet.

---

## Stage 1 — Community-first shell scaffolding

- Introduce `CommunityRail` as additive shell plugin (feature-flagged).
- Keep existing routes functional; add route aliases for new community paths.
- Add command palette hooks without changing timeline internals.

**Risk profile:** low (additive, reversible).

---

## Stage 2 — Dense channel discovery

- Add `ChannelDiscoveryDenseList` and `DiscoveryFacetPanel` in discovery routes.
- Preserve legacy discovery entrypoints and mirror results for validation.
- Add performance budgets for dense lists (render and search latency).

**Risk profile:** low-medium (new UI surfaces, no protocol changes).

---

## Stage 3 — Role-rich member surfaces

- Add `RoleRichMemberCard` and `MemberRoleBadgeSet` in right panel.
- Map role signals from existing Matrix power levels and membership metadata.
- Keep current member panel as fallback via feature flag.

**Risk profile:** medium (right-panel composition and state synchronization).

---

## Stage 4 — Onboarding flow improvements

- Add onboarding wizard shell and two high-value steps:
  - community selection,
  - channel selection.
- Keep legacy onboarding route as escape hatch.
- Instrument completion funnels and time-to-first-message.

**Risk profile:** medium (new stateful flow, still reversible).

---

## Stage 5 — Consolidation and default rollout

- Promote new UX as default only after parity gates pass.
- Remove temporary route aliases and duplicate UI bridges.
- Keep kill switches for one release cycle.

**Risk profile:** medium-high (default experience shift).

---

## Verification gates by stage

1. **Matrix compatibility:** no payload/schema drift in message, membership, receipts, room graph operations.
2. **Accessibility:** WCAG contrast, keyboard-only full journey, screen-reader landmark flow.
3. **Performance:** no regressions beyond agreed budget in route transitions and discovery filtering.
4. **Behavior parity:** send/edit/redact/reply/react unchanged across old and new shell contexts.

---

## Suggested implementation ownership split

- **Frontend Platform:** shell slots, command palette, registry/manifest guardrails.
- **Community UX:** community rail, hub, dense channel discovery.
- **Trust & Safety / Social:** role-rich member surfaces and moderation affordances.
- **Growth:** onboarding flow improvements and funnel telemetry.
