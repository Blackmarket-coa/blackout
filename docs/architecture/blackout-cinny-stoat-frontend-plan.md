# Using Cinny and Stoat Together for a Blackout Frontend

**Architecture note and implementation plan**  
Prepared for Tyree Roberson · April 12, 2026

## Bottom line

Blackout should use **Cinny** as the Matrix-native base and use **Stoat** selectively as a reference source for product patterns, community UX, and a few isolated frontend ideas. The realistic goal is **not** to merge the two clients directly; it is to create a Blackout frontend that preserves Matrix compatibility while adopting Stoat-inspired interaction design where it improves usability.

## Executive summary

Cinny and Stoat solve adjacent but different problems:

- **Cinny** is a Matrix client optimized around a simple and elegant interface.
- **Stoat** is a full chat platform with its own backend, API, and client stack.

Because they sit on different protocols, the strongest strategy is selective combination rather than code-level fusion.

The most usable parts of Stoat for Blackout are its product assumptions:

- clearer server-and-channel ergonomics,
- role-driven community flows,
- persistent social presence patterns,
- and a more direct Discord-like feel.

The least reusable parts are Stoat protocol objects, gateway behavior, voice internals, and backend services.

Blackout should:

1. keep Matrix as transport, federation, and identity,
2. expose Blackout-specific logic through a dedicated service layer,
3. build a custom frontend shell that presents a cleaner community model above Matrix.

Stoat should inform that shell and not become a hard dependency across the stack.

## Design principles

| Principle | Meaning for Blackout |
| --- | --- |
| Matrix-first foundation | Keep Blackout compatible with existing Matrix architecture and homeserver ecosystem. |
| UI over protocol mixing | Borrow Stoat where the gain is UX/layout/workflow, not where it forces protocol rewrites. |
| Blackout-owned service layer | Keep governance, logistics, marketplace, and automation logic in Blackout services instead of Matrix room state. |
| Fork only where leverage is high | Prefer frontend adaptation and abstraction layers before backend divergence. |

## What each project contributes

### Cinny strengths

- Native fit for Matrix and federation.
- Aligned with Blackout's distributed communication direction.
- Better long-term fit for encrypted and decentralized workflows.
- Clean path for compatibility with homeservers, spaces, rooms, and sync evolution.

### Stoat strengths

- Stronger Discord-like product feel out of the box.
- Clearer community-server mental model.
- Simpler role and channel ergonomics at the product layer.
- Useful reference for onboarding, navigation density, and social presence design.

## Reusability matrix

| Capability | Usable? | Recommendation |
| --- | --- | --- |
| Stoat interaction patterns | Yes | Recreate in Blackout UI (navigation density, community-first layout, member list, channel discovery). |
| Stoat visual language | Yes | Use as inspiration only and reimplement in Blackout's design system. |
| Small frontend concepts | Sometimes | Port selected ideas with rewrite effort; direct imports are unrealistic due to protocol assumptions. |
| Stoat API objects and SDK logic | No | Too coupled to Stoat backend model. |
| Stoat voice implementation | No | Signaling and runtime assumptions do not map cleanly to Matrix. |
| Stoat backend services | No | Would create parallel infrastructure and reduce Matrix-stack focus. |

## Recommended Blackout frontend architecture

```text
Blackout Frontend Shell
   ↓
Blackout Community Layer
   ↓
Cinny / Matrix Client Core
   ↓
Blackout Service Layer
   ├ Governance and roles
   ├ Logistics and dispatch
   ├ Marketplace and transactions
   ├ Bot and automation gateway
   └ Voice and presence services
   ↓
Matrix Homeserver Network
```

In this model, Cinny remains the Matrix-native engine. The Blackout frontend shell and community layer reshape the experience so users interact with communities, roles, channels, tasks, and workflows instead of raw Matrix complexity. Stoat's role is to inform the shell and community layer, not replace the transport protocol.

## How to use Stoat and Cinny together in practice

1. **Use Cinny as the base client**  
   Retain Matrix support, federation compatibility, and the current Blackout deployment model.
2. **Build a Blackout design system**  
   Create shared primitives for sidebars, badges, channel lists, profile surfaces, role chips, and action trays.
3. **Add a community abstraction layer**  
   Present communities, channels, voice rooms, roles, and workflows above spaces, rooms, and power levels.
4. **Add Blackout-only services**  
   Keep marketplace, governance, logistics, and automation logic outside the Matrix room graph.
5. **Port selected Stoat-inspired patterns**  
   Prioritize onboarding, discovery, social presence, and richer navigation.
6. **Keep boundaries strict**  
   Do not splice Stoat backend code into Matrix paths unless a deliberate future fork is justified.

## Feature split for implementation

| Layer | What belongs there |
| --- | --- |
| Cinny / Matrix layer | Authentication, room transport, federation, encryption, sync, baseline presence, and Matrix compatibility. |
| Blackout frontend shell | Community navigation, Stoat-inspired layout, cross-room workflow panels, dashboards, vendor/logistics surfaces, and social UX polish. |
| Blackout services | Role policy engine, automation, task orchestration, dispatch, marketplace logic, AI helpers, and voice-room coordination. |
| Stoat as reference only | Navigation ideas, ergonomics, onboarding, and community-state presentation patterns. |

## Suggested repo and package layout

```text
apps/
  blackout-web            # Blackout shell and UX layer
packages/
  blackout-design-system  # shared UI primitives
  blackout-community      # community abstraction, role mapping, navigation
  blackout-matrix-adapter # Matrix-specific data translation
  blackout-services-sdk   # typed access to Blackout backend services
services/
  community-service
  policy-service
  automation-gateway
  voice-service
  marketplace-service
```

## Risks and guardrails

- Do not attempt a hard merge of Stoat and Cinny codebases early.
- Do not push core Blackout product logic into Matrix room state when ownership/search/auditability/cross-room coordination are required.
- Do not copy Stoat visuals directly; adapt to Blackout's own design language.
- Keep architecture modular so transport can expand beyond Matrix in the future.

## Recommended next steps

1. Fork the current Cinny-based frontend into a Blackout shell layer.
2. Define a Blackout community model that maps to Matrix spaces, rooms, and power levels.
3. Prototype three Stoat-inspired flows: server switching, channel discovery, persistent social presence.
4. Stand up Blackout service interfaces for roles, automation, and voice-room orchestration.
5. Evaluate UX against real community and marketplace workflows before deeper client divergence.

## Source notes

- Cinny is documented as a Matrix client and mentions ongoing SDK evolution in its README.
- Stoat documents separate repositories for frontend, self-hosting stack, and JavaScript SDK.
- Matrix documents Application Service APIs for extensibility and ongoing client sync improvements.
