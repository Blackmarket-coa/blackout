# BLACKOUT: 14-Stream Revenue Implementation Plan

**Monetization features mapped to code changes across 7 phases**  
Repository: `github.com/Blackmarket-coa/blackout`  
Date: March 2026

---

## Architecture & Monetization Map

This plan maps 14 revenue streams into the Blackout repository (Element Web fork) across 7 phases spanning ~30 weeks. Phases are sequenced by dependency order and expected revenue impact.

### Stream Categories

- **Category A (Org Tiers)**
  - Coalition ($9/mo)
  - Sovereign ($29/mo)
  - Managed Homeserver ($99/mo)
  - Enterprise ($5K/mo)
  - **Dependency:** subscription billing infrastructure + feature gating.

- **Category B (Discord-Adapted)**
  - Blackout Signal ($4.99/mo)
  - Coalition Boosts
  - Space Subscriptions
  - Marketplace Bridge
  - Coalition Quests
  - Governance Module Marketplace

- **Category C (Repo-Discovered)**
  - Self-Healing Federation ($19/mo)
  - SFU Townhall ($15/mo)
  - Steg-Voting Compliance ($49/mo)
  - Bounty Payroll ($9/mo)
  - Encrypted Media Vault ($4.99/mo)
  - Blackbox Hardware ($199 + $12/mo)

- **Category D (Services)**
  - Consulting ($150/hr)
  - Federation Bridge Fees ($5/mo/connection)

### Key repository surfaces

- `src/steganography/*` — Steg subsystem (B1, C3, C5)
- `src/components/*` — UI components for feature gates
- `module_system/` — Runtime extension API (B6)
- `docs/distributed_self_healing_blueprint.md` — Federation architecture (C1)
- `docs/features/governance_features_analysis.md` — Voting/bounty (B5, C3, C4)
- `src/settings/*` — Feature flags and subscription tier logic

---

## Phase 0: Billing & Feature Flag Infrastructure (Weeks 1–4)

Before monetizing any feature, implement subscription billing, tier-based flags, and a unified account system.

| Task | Key Files/Dirs | Revenue Stream | Weeks | Risk |
|---|---|---|---|---|
| Stripe integration for subscription billing | `src/billing/*`, `package.json` | All A+B | 1–2 | Low |
| Feature flag system with tier-based gating | `src/settings/FeatureFlags.ts`, `src/settings/SubscriptionTier.ts` | All | 1 | Low |
| Subscription tier definitions (Free/Signal/Coalition/Sovereign/Enterprise) | `src/models/Tiers.ts`, `config.json` | A1-A4, B1 | 0.5 | Low |
| Account portal UI (subscription, billing, tier status) | `src/components/views/settings/tabs/AccountTab.tsx` | All | 1–2 | Low |
| Webhook handlers for Stripe events | `src/billing/webhooks.ts` | All | 0.5 | Low |

**Key decisions**
- Use Stripe Checkout + Customer Portal for fastest time-to-revenue.
- Feature flags should default to the most-permissive tier locally for developer convenience.
- Tier definitions are the single source of truth for feature gating.

---

## Phase 1: Steganography Tiering & Individual Premium (Weeks 3–6)

Use existing `src/steganography/` to split free/premium capabilities, launch Blackout Signal, and add Encrypted Media Vault.

| Task | Key Files/Dirs | Revenue Stream | Weeks | Risk |
|---|---|---|---|---|
| Split steg codecs into free/premium tiers | `src/steganography/codecs/*`, `src/steganography/StegTierGate.ts` | B1, C5 | 1–2 | Low |
| Free tier: basic image LSB only | `src/steganography/codecs/lsb.ts` | B1 | 0.5 | Low |
| Premium tier: DCT image, audio steg, batch ops | `src/steganography/codecs/dct.ts`, `audio.ts`, `batch.ts` | B1 | 1–2 | Med |
| Steg UI with tier badges | `src/components/views/steganography/StegPanel.tsx` | B1 | 1 | Low |
| Encrypted Media Vault | `src/components/views/media/EncryptedVault.tsx`, `src/media/WatermarkService.ts` | C5 | 1–2 | Med |
| Priority federation relay for Signal | `src/federation/PriorityRelay.ts` (server-side config) | B1 | 0.5 | Med |

**Key decisions**
- Extend existing steg test suite for DCT/audio codecs.
- Vault watermarking embeds provenance metadata in every stored file.
- Priority relay is primarily a server-side change; client should expose preference flags.

---

## Phase 2: Governance Monetization (Weeks 5–10)

Leverage existing governance capabilities to add premium governance, steg-voting, and bounty payroll.

| Task | Key Files/Dirs | Revenue Stream | Weeks | Risk |
|---|---|---|---|---|
| Gate governance rooms by subscription tier | `src/components/views/rooms/GovernanceRoom.tsx`, `src/settings/FeatureFlags.ts` | A1-A2 | 1 | Low |
| Steg-voting for anonymous/verifiable elections | `src/steganography/voting/StegBallot.ts`, `src/governance/AnonymousVote.tsx` | C3 | 2–3 | High |
| Voting widget library (ranked, quadratic, approval, score) | `src/governance/voting/*`, `module_system/widgets/voting/` | B6, C3 | 2 | Med |
| Bounty ledger automated payout scheduling | `src/governance/bounty/PayoutScheduler.ts` | C4 | 1–2 | Med |
| Bounty payroll tax-doc generation | `src/governance/bounty/TaxDocGenerator.ts` | C4 | 1 | Med |
| SFU Townhall (50+ E2EE video + live voting) | `src/components/views/voip/TownhallView.tsx`, `src/voip/SFUManager.ts` | C2 | 2–3 | High |

**Key decisions**
- Ship steg-voting as beta initially due to complexity.
- SFU Townhall requires server-side SFU infrastructure (e.g., LiveKit/Jitsi).
- Keep voting widgets as `module_system` plugins for later marketplace distribution.

---

## Phase 3: Community Economics (Boosts, Spaces, Quests) (Weeks 9–14)

Implements Discord-adapted community monetization tracks.

| Task | Key Files/Dirs | Revenue Stream | Weeks | Risk |
|---|---|---|---|---|
| Coalition Boosts (3 tiers) | `src/components/views/rooms/BoostPanel.tsx`, `src/billing/BoostManager.ts` | B2 | 2 | Med |
| Boost effects (audio, TURN, storage, invites) | `src/settings/ServerBoostTiers.ts`, Blackout_server config | B2 | 1 | Med |
| Space Subscriptions (95/5 split) | `src/components/views/spaces/SpaceSubscription.tsx`, `src/billing/SpacePayments.ts` | B3 | 2–3 | Med |
| Coalition Quests bounty board UI | `src/components/views/quests/QuestBoard.tsx`, `src/quests/QuestManager.ts` | B5 | 2 | Med |
| Quest settlement + FBM redeemable credits | `src/quests/CreditLedger.ts`, API bridge to FBM | B5 | 1–2 | High |
| Marketplace Bridge for FBM digital products | `src/components/views/marketplace/SpaceShop.tsx`, `src/marketplace/FBMBridge.ts` | B4 | 2 | High |

**Key decisions**
- Space subscriptions likely need Stripe Connect for creator payouts.
- Quest credits need a clear API contract with MedusaJS backend.
- Start marketplace bridge with digital goods only.

---

## Phase 4: Self-Healing Federation & Managed Hosting (Weeks 13–18)

Implements the distributed self-healing blueprint and managed hosting streams.

| Task | Key Files/Dirs | Revenue Stream | Weeks | Risk |
|---|---|---|---|---|
| CRDT-based state rebuild engine | `src/federation/crdt/StateRebuilder.ts` | C1 | 2–3 | High |
| Peer replication + gossip discovery | `src/federation/gossip/PeerDiscovery.ts`, `src/federation/replication/` | C1 | 2–3 | High |
| Snapshot/replay failover recovery | `src/federation/recovery/SnapshotManager.ts` | C1 | 1–2 | High |
| Self-healing SLA monitoring dashboard | `src/components/views/admin/FederationHealth.tsx` | C1 | 1 | Med |
| Managed homeserver provisioning automation | `scripts/provision-homeserver.sh`, `deploy/terraform/` | A3 | 2 | Med |
| Federation bridge connections | `src/federation/bridges/*`, Blackout_server bridge configs | D2 | 2 | Med |

**Key decisions**
- This is the largest engineering effort in the plan.
- Consider shipping gossip discovery before full CRDT rebuild.
- Managed hosting automation can use Railway API or Terraform.
- Bridge fees are a relatively low-effort recurring stream.

---

## Phase 5: Module Marketplace & Third-Party Ecosystem (Weeks 17–22)

Build monetization on top of existing `module_system/` extension architecture.

| Task | Key Files/Dirs | Revenue Stream | Weeks | Risk |
|---|---|---|---|---|
| Module marketplace storefront UI | `src/components/views/marketplace/ModuleStore.tsx` | B6 | 2 | Med |
| Submission/review/sandbox pipeline | `module_system/marketplace/SubmissionPipeline.ts`, `module_system/sandbox/` | B6 | 2–3 | High |
| Purchase + install flow (85/15 split) | `src/billing/ModulePayments.ts`, `module_system/marketplace/Billing.ts` | B6 | 1–2 | Med |
| First-party seed modules (budget/compliance/timebank) | `module_system/modules/budget/`, `compliance/`, `timebank/` | B6 | 2–3 | Med |
| API docs + developer onboarding | `docs/module-developer-guide.md`, `module_system/examples/` | B6 | 1 | Low |

**Key decisions**
- Seed marketplace with 3–5 first-party modules.
- Sandboxing is critical: modules must not access E2EE keys.
- Consider a developer preview before general availability.

---

## Phase 6: Blackbox Hardware & Mesh Integration (Weeks 21–30)

Build physical mesh-node revenue stream with software + firmware integration.

| Task | Key Files/Dirs | Revenue Stream | Weeks | Risk |
|---|---|---|---|---|
| Hardware spec + BOM | `hardware/blackbox/BOM.md`, `hardware/blackbox/schematic/` | C6 | 2 | Med |
| Embedded Blackout_server build | `Blackout_server/embedded/`, `Dockerfile.embedded` | C6 | 3–4 | High |
| LoRa mesh relay protocol | `hardware/blackbox/firmware/mesh/LoRaRelay.ts` | C6 | 2–3 | High |
| Subscription billing for firmware/relay | `src/billing/BlackboxSubscription.ts` | C6 | 1 | Low |
| Client pairing + mesh status UI | `src/components/views/mesh/BlackboxPairing.tsx`, `MeshStatus.tsx` | C6 | 1–2 | Med |
| Firmware OTA update pipeline | `hardware/blackbox/firmware/ota/UpdateServer.ts` | C6 | 1–2 | Med |

**Key decisions**
- Start with Raspberry Pi 5 prototypes before custom PCB.
- Recycled Android nodes are a strong strategic option.
- LoRa mesh + Blackout E2EE is a differentiating capability.
- Pre-orders can help fund first production runs.

---

## Implementation Timeline Summary

| Phase | Weeks | Streams | Revenue (Y1) | Dependencies |
|---|---|---|---|---|
| 0: Billing | 1–4 | All (infra) | $0 | None |
| 1: Steg Tiers | 3–6 | B1, C5 | ~$1,500 | Phase 0 |
| 2: Governance | 5–10 | C2, C3, C4 | ~$0 (Y1) | Phase 0 |
| 3: Community Econ | 9–14 | B2-B5 | ~$700 | Phase 0, 2 |
| 4: Federation | 13–18 | C1, A3, D2 | ~$3,000 | Phase 0 |
| 5: Modules | 17–22 | B6 | ~$0 (Y1) | Phase 2 |
| 6: Blackbox | 21–30 | C6 | ~$0 (Y1) | Phase 4 |

- **Total implementation:** ~30 weeks for all 14 streams.
- **Revenue start:** Phase 1 (week 3), plus services track.
- **Critical path:** Phase 0 → Phase 1 → Phase 2 → Phase 4.
- **Parallel tracks:**
  - Phase 3 can run alongside Phase 2.
  - Phase 5 can start once governance widgets exist.
  - Phase 6 hardware design can begin independently while software phases proceed.
