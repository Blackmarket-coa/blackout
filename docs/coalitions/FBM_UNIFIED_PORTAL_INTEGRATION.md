# FBM unified portal: Coalition integration contract

**Decision date:** 2026-11-12  
**Status:** Approved product direction; integration work is proposed, not a deployment claim.  
**Canonical experience plan:** [FBM unified member portal plan](https://github.com/Blackmarket-coa/free-black-market/blob/47f81529f834565ad8ccf0fbca4e64d876ca3fb0/docs/FBM_UNIFIED_MEMBER_PORTAL_PLAN.md).

FBM is one signed-in online farmers market: members buy, sell, trade and participate in goods auctions from the same character-built portal. Its character-creation survey learns real-life goals/resources/preferences, previews a starter toolkit, and automatically assembles a useful workspace. Game view is standard; upgrades are functional equipment with one-time purchases and no subscriptions.

## Reuse Blackout Coalition

Coalition is the shared real-world map and community coordination surface. Do not build a second map/needs/project/task backend in FBM. Its fictional game-world layout is navigation, not an alternative geographic map.

| Existing implementation | Reuse in the FBM member experience |
| --- | --- |
| CoalitionMap / MapTab / place model | Map discovery, opt-in pickup/resource places, approximate service areas and later sourced research layers |
| NeedsTab / ResourcesTab | Community needs, shared-resource offers and availability |
| ProjectsTab / TasksTab | Food/resource drives, production or infrastructure projects, and actionable coordination |
| ChatTab / Matrix room components | Colleague and project conversation with real room access and unread/mute behavior |
| EventLogistics | Existing volunteer signups and event ride-offer/claim paths where enabled |

Starting points are [Coalition tabs](../../apps/blackout-client/src/app/features/coalition/tabs), [client](../../apps/blackout-client/src/app/features/coalition/coalitionClient.ts), [routes](../../packages/api/src/routes/coalition.ts) and [place contract](../../packages/core/src/coalition/place.ts). Source existence is not proof of running-stack readiness.

## Record and authorization boundaries

Blackout retains its existing Coalition records, memberships/roles, rooms and spatial projections. FBM retains commerce, inventory, needs/exchange domains already implemented there, agreements, orders, entitlements and payout records. Blackstar retains operator eligibility and transport lifecycle.

Link Coalition/project/place IDs to FBM pools/listings/orders and Blackstar jobs. Do not make both systems editable authorities for the same record or flatten a project, inventory lot and shipment into one object. Mirror only approved projections with stable event IDs, retries and reconciliation.

Reuse FBM's existing Blackout spatial consumer and bridge clients. Next.js cannot directly import a client view that assumes Blackout-specific state/auth. Choose a versioned shared view or permission-safe adapter, preserving one maintained map implementation.

Member-to-Matrix/operator links must be verified; a token or seller ID submitted by the browser is not proof of access. Team scope remains distinct from personal context even though the portal is unified.

## Character builds and equipment

An organizer build can compose Coalition map, needs, resources, projects, tasks and chat alongside FBM inventory and Blackstar fulfillment links. A transport answer may suggest explicit Blackstar operator setup. Survey answers or purchases must not grant Coalition membership, activate transport eligibility or publish private records.

Use existing functionality first; finish actual wiring before adding OSS. Paid equipment may configure a supported interface or automation, with preview/one-time price; accepting a starter build never charges the member. Privacy and E2EE remain outside paid barriers.

## Blackstar seam and limits

Transport work reuses Blackstar's board, eligibility, voluntary claims, bid/award API and leg progression. A transport bid is not a timed goods auction. Node/service-radius data and Coalition refs exist in source; runtime membership provisioning and end-to-end behavior need verification.

The inspected Blackstar award controller is **poster-only**. It does not grant a Coalition coordinator award authority. FBM service-account-created bid listings need an explicit authenticated delegation/role decision before Coalition reverse bidding can be described as complete. Ordinary first-claim delivery is a separate path.

A Coalition resource availability field is not proof of booking/reservation, and an event ride claim is not a freight contract. Link the right owning workflow rather than claiming capability from a card label.

## Acceptance and rollout

1. Survey → portal preview → organizer build exposes real existing views/actions with correct scope.
2. A member can follow a Coalition project/resource to the proper FBM exchange and optional Blackstar delivery without duplicate records or another mandatory buyer/vendor portal.
3. Existing needs/resources/project/task create/update, room access, volunteer signup and ride actions work in the running stack before release.
4. Public maps use consented projections and preserve pin-versus-area semantics. Private needs, precise shipment addresses, bridge secrets and live operator positions are not published.
5. Disabled/unavailable services show honest recovery; buying and personal records remain accessible.
6. Contract-test IDs, permissions, projection fields, replays/retries/cancellations and shipment/leg distinctions. Research layers cite geography, date and uncertainty; no inference of individual beliefs.

This documentation introduces no route, permission, event schema, runtime flag, billing or deployment change.
