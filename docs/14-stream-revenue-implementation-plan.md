# BLACKOUT 14-Stream Revenue Implementation Plan

- **Repository:** `github.com/Blackmarket-coa/blackout`
- **Date:** March 2026
- **Scope:** 14 revenue streams mapped to concrete code changes across 7 phases (~30 weeks)

## Architecture & Monetization Map

This plan implements 14 revenue streams into the Blackout repository (Element Web fork). Streams are grouped into four categories aligned to the financial model.

### Category A (Org Tiers)

- Coalition ($9/mo)
- Sovereign ($29/mo)
- Managed Homeserver ($99/mo)
- Enterprise ($5K/mo)

> Requires subscription billing infrastructure plus feature-gating.

### Category B (Discord-Adapted)

- Blackout Signal ($4.99/mo)
- Coalition Boosts
- Space Subscriptions
- Marketplace Bridge
- Coalition Quests
- Governance Module Marketplace

> Adapts proven Discord monetization patterns to sovereignty-aligned equivalents.

### Category C (Repo-Discovered)

- Self-Healing Federation ($19/mo)
- SFU Townhall ($15/mo)
- Steg-Voting Compliance ($49/mo)
- Bounty Payroll ($9/mo)
- Encrypted Media Vault ($4.99/mo)
- Blackbox Hardware ($199 + $12/mo)

> Novel revenue streams derived from existing repository capabilities.

### Category D (Services)

- Consulting ($150/hr)
- Federation Bridge Fees ($5/mo/connection)

## Key Files in Repo

- `src/steganography/*` — Steg subsystem (streams B1, C3, C5)
- `src/components/*` — UI components for all feature gates
- `module_system/` — Runtime extension API (stream B6)
- `docs/distributed_self_healing_blueprint.md` — Federation architecture (C1)
- `docs/features/governance_features_analysis.md` — Voting/bounty (B5, C3, C4)
- `src/settings/*` — Feature flags and subscription tier logic

---

## Phase 0: Billing & Feature Flag Infrastructure (Weeks 1–4)

Before monetizing features, implement subscription billing, tier-based flags, and unified account plumbing.

| Task | Key Files/Dirs | Revenue Stream | Weeks | Risk |
|---|---|---|---|---|
| Stripe integration for subscription billing | `src/billing/*`, `package.json` | All A+B | 1–2 | LOW |
| Feature flag system with tier-based gating | `src/settings/FeatureFlags.ts`, `src/settings/SubscriptionTier.ts` | All | 1 | LOW |
| Subscription tier definitions (Free/Signal/Coalition/Sovereign/Enterprise) | `src/models/Tiers.ts`, `config.json` | A1–A4, B1 | 0.5 | LOW |
| Account portal UI: manage subscription, billing, tier status | `src/components/views/settings/tabs/AccountTab.tsx` | All | 1–2 | LOW |
| Webhook handlers for Stripe events (upgrade, downgrade, cancel) | `src/billing/webhooks.ts` | All | 0.5 | LOW |

### Key decisions

- Use Stripe Checkout + Customer Portal for fastest time-to-revenue.
- Feature flags default to most-permissive tier locally for development convenience.
- Tier definitions are the single source of truth for all gated features.

---

## Phase 1: Steganography Tiering & Individual Premium (Weeks 3–6)

Leverage existing `src/steganography/` and split free vs premium capability while introducing Blackout Signal and Encrypted Media Vault.

| Task | Key Files/Dirs | Revenue Stream | Weeks | Risk |
|---|---|---|---|---|
| Split steg codecs into free/premium tiers | `src/steganography/codecs/*`, `src/steganography/StegTierGate.ts` | B1, C5 | 1–2 | LOW |
| Free tier: basic image LSB encoding only | `src/steganography/codecs/lsb.ts` | B1 | 0.5 | LOW |
| Premium tier: DCT image steg, audio steg, batch operations | `src/steganography/codecs/dct.ts`, `audio.ts`, `batch.ts` | B1 | 1–2 | MED |
| Steg UI: encode/decode panel with tier badges | `src/components/views/steganography/StegPanel.tsx` | B1 | 1 | LOW |
| Encrypted Media Vault: persistent steg-watermarked archive | `src/components/views/media/EncryptedVault.tsx`, `src/media/WatermarkService.ts` | C5 | 1–2 | MED |
| Priority federation relay for Signal tier | `src/federation/PriorityRelay.ts` (server-side config) | B1 | 0.5 | MED |

### Key decisions

- Extend the existing steg test suite for DCT and audio codecs.
- Watermarking in the vault embeds provenance metadata in every stored file.
- Priority relay is a server-side (`Blackout_server`) change; the client should only flag preference.

---

## Phase 2: Governance Monetization (Weeks 5–10)

Monetize existing governance components by adding tier gates, anonymous steg-voting, payout automation, and SFU townhall enhancements.

| Task | Key Files/Dirs | Revenue Stream | Weeks | Risk |
|---|---|---|---|---|
| Gate governance rooms by subscription tier | `src/components/views/rooms/GovernanceRoom.tsx`, `src/settings/FeatureFlags.ts` | A1–A2 | 1 | LOW |
| Steg-voting: embed ballots in images for anonymous verifiable elections | `src/steganography/voting/StegBallot.ts`, `src/governance/AnonymousVote.tsx` | C3 | 2–3 | HIGH |
| Voting widget library: ranked choice, quadratic, approval, score | `src/governance/voting/*`, `module_system/widgets/voting/` | B6, C3 | 2 | MED |
| Bounty ledger: automated payout scheduling | `src/governance/bounty/PayoutScheduler.ts` | C4 | 1–2 | MED |
| Bounty payroll: 1099/tax document generation | `src/governance/bounty/TaxDocGenerator.ts` | C4 | 1 | MED |
| SFU Townhall: 50+ participant E2EE video with speaker queue + live voting | `src/components/views/voip/TownhallView.tsx`, `src/voip/SFUManager.ts` | C2 | 2–3 | HIGH |

### Key decisions

- Ship steg-voting as beta initially due to complexity.
- SFU Townhall requires server-side SFU infra (e.g., LiveKit or Jitsi), with expected infra cost at scale.
- Voting widgets should be `module_system` plugins for third-party commercialization in Phase 5.

---

## Phase 3: Community Economics (Boosts, Spaces, Quests) (Weeks 9–14)

Implements Discord-inspired community revenue mechanics adapted for Blackout.

| Task | Key Files/Dirs | Revenue Stream | Weeks | Risk |
|---|---|---|---|---|
| Coalition Boosts: community-funded homeserver upgrades (3 tiers) | `src/components/views/rooms/BoostPanel.tsx`, `src/billing/BoostManager.ts` | B2 | 2 | MED |
| Boost tier effects: audio quality, TURN priority, storage, custom invite links | `src/settings/ServerBoostTiers.ts`, `Blackout_server` config | B2 | 1 | MED |
| Space Subscriptions: gated Matrix spaces with 95/5 rev split | `src/components/views/spaces/SpaceSubscription.tsx`, `src/billing/SpacePayments.ts` | B3 | 2–3 | MED |
| Coalition Quests: bounty board UI for task posting and claiming | `src/components/views/quests/QuestBoard.tsx`, `src/quests/QuestManager.ts` | B5 | 2 | MED |
| Quest settlement: credit system redeemable in FreeBlackMarket | `src/quests/CreditLedger.ts`, API bridge to FBM | B5 | 1–2 | HIGH |
| Marketplace Bridge: sell FBM digital products inside encrypted spaces | `src/components/views/marketplace/SpaceShop.tsx`, `src/marketplace/FBMBridge.ts` | B4 | 2 | HIGH |

### Key decisions

- Space Subscriptions require Stripe Connect for org payouts.
- Quest credits -> FreeBlackMarket needs API contract with MedusaJS backend.
- Launch Marketplace Bridge with digital products first.

---

## Phase 4: Self-Healing Federation & Managed Hosting (Weeks 13–18)

Implements the self-healing federation blueprint and managed hosting stream.

| Task | Key Files/Dirs | Revenue Stream | Weeks | Risk |
|---|---|---|---|---|
| CRDT-based state rebuild engine | `src/federation/crdt/StateRebuilder.ts` | C1 | 2–3 | HIGH |
| Peer replication + gossip discovery protocol | `src/federation/gossip/PeerDiscovery.ts`, `src/federation/replication/` | C1 | 2–3 | HIGH |
| Snapshot/replay recovery for homeserver failover | `src/federation/recovery/SnapshotManager.ts` | C1 | 1–2 | HIGH |
| Self-healing SLA monitoring dashboard | `src/components/views/admin/FederationHealth.tsx` | C1 | 1 | MED |
| Managed homeserver provisioning automation | `scripts/provision-homeserver.sh`, `deploy/terraform/` | A3 | 2 | MED |
| Federation bridge connections (Discord, Signal, WhatsApp) | `src/federation/bridges/*`, `Blackout_server` bridge configs | D2 | 2 | MED |

### Key decisions

- Ship gossip discovery first as lower-risk wedge before full CRDT state rebuild.
- Provisioning automation can use Railway API or Terraform.
- Bridge fees are low-effort recurring revenue once billing + hosting are wired.

---

## Phase 5: Module Marketplace & Third-Party Ecosystem (Weeks 17–22)

Build monetized plugin ecosystem on top of existing `module_system/` runtime extension API.

| Task | Key Files/Dirs | Revenue Stream | Weeks | Risk |
|---|---|---|---|---|
| Module marketplace storefront UI | `src/components/views/marketplace/ModuleStore.tsx` | B6 | 2 | MED |
| Module submission, review, and sandboxing pipeline | `module_system/marketplace/SubmissionPipeline.ts`, `module_system/sandbox/` | B6 | 2–3 | HIGH |
| Module billing: purchase + install flow with 85/15 split | `src/billing/ModulePayments.ts`, `module_system/marketplace/Billing.ts` | B6 | 1–2 | MED |
| First-party modules: budget allocator, compliance audit trail, time-banking calc | `module_system/modules/budget/`, `compliance/`, `timebank/` | B6 | 2–3 | MED |
| Module API documentation and developer onboarding | `docs/module-developer-guide.md`, `module_system/examples/` | B6 | 1 | LOW |

### Key decisions

- Seed marketplace with 3–5 first-party modules before opening to third parties.
- Sandboxing is critical to prevent module access to E2EE keys.
- Consider a developer preview program prior to full launch.

---

## Phase 6: Blackbox Hardware & Mesh Integration (Weeks 21–30)

Define hardware/software stack for off-grid mesh node and recurring firmware/relay subscription.

| Task | Key Files/Dirs | Revenue Stream | Weeks | Risk |
|---|---|---|---|---|
| Blackbox hardware specification and BOM | `hardware/blackbox/BOM.md`, `hardware/blackbox/schematic/` | C6 | 2 | MED |
| Lightweight Blackout_server for embedded Linux (RPi/recycled Android) | `Blackout_server/embedded/`, `Dockerfile.embedded` | C6 | 3–4 | HIGH |
| LoRa mesh relay protocol for off-grid encrypted comms | `hardware/blackbox/firmware/mesh/LoRaRelay.ts` | C6 | 2–3 | HIGH |
| Blackbox subscription billing ($12/mo for firmware + relay access) | `src/billing/BlackboxSubscription.ts` | C6 | 1 | LOW |
| Client-side Blackbox pairing and mesh status UI | `src/components/views/mesh/BlackboxPairing.tsx`, `MeshStatus.tsx` | C6 | 1–2 | MED |
| Firmware OTA update pipeline | `hardware/blackbox/firmware/ota/UpdateServer.ts` | C6 | 1–2 | MED |

### Key decisions

- Start with Raspberry Pi 5 prototype before custom PCB.
- Recycled Android-node option supports solarpunk narrative and lowers adoption cost.
- LoRa mesh + Blackout E2EE is a differentiated strategic moat.
- Pre-orders can partially fund initial production run.

---

## Implementation Timeline Summary

| Phase | Weeks | Streams | Revenue (Y1) | Dependencies |
|---|---|---|---|---|
| 0: Billing | 1–4 | All (infra) | $0 | None |
| 1: Steg Tiers | 3–6 | B1, C5 | ~$1,500 | Phase 0 |
| 2: Governance | 5–10 | C2, C3, C4 | ~$0 (Y1) | Phase 0 |
| 3: Community Econ | 9–14 | B2–B5 | ~$700 | Phase 0, 2 |
| 4: Federation | 13–18 | C1, A3, D2 | ~$3,000 | Phase 0 |
| 5: Modules | 17–22 | B6 | ~$0 (Y1) | Phase 2 |
| 6: Blackbox | 21–30 | C6 | ~$0 (Y1) | Phase 4 |

- **Total implementation:** ~30 weeks for all 14 streams.
- **Initial revenue:** starts in Phase 1 (week 3) via steganography tiering and consulting.
- **Largest impact streams:** governance (Phase 2) and self-healing federation (Phase 4).

### Critical path

Phase 0 (billing) → Phase 1 (steg tiers) → Phase 2 (governance) → Phase 4 (federation).

### Parallel tracks

- Phase 3 (community economics) can run alongside Phase 2.
- Phase 5 (modules) can start once governance widgets exist.
- Phase 6 (hardware) is largely independent and can begin during software phases.
