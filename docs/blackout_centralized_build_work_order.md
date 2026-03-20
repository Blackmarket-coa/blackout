# Blackout Centralized Build Checklist + Work Order

This document centralizes current build context, architecture techniques, open work, and an execution work order for **Blackout (Encrypted Communication & Governance)**.

## 1) Mission Context

Blackout is a secure communication and governance platform on Matrix/Synapse with emphasis on:

- End-to-end encryption and metadata minimization.
- Resilient community coordination under adverse conditions.
- Governance-grade integrity, auditability, and compartmentalization.

## 1.1) Strategic posture (product + market)

Blackout execution should maintain the following strategic posture across all work orders:

- **Value-first UX (Slack lesson):** governance participation and coordination must stay frictionless for everyday users.
- **Privacy + decentralization credibility (Telegram/Rocket.Chat lesson):** maintain robust self-host and federation pathways as first-class capabilities.
- **Category focus (anti-Teams sprawl):** keep Blackout anchored as the cooperative governance + secure communication layer.
- **Compounding moat sequence:** accelerate in this order: steganography adoption -> governance trust -> federation network effects -> inter-community voting.

### Roadmap alignment anchors

This work order is intentionally aligned with the program artifacts that already define execution sequence and architecture:

- Centralized work-order structure and release gate flow: `docs/blackout_centralized_build_work_order.md`, `docs/blackout_all_phases_one_shot_prompt.md`.
- Governance architecture and phased delivery: `docs/blackout-governance-build-plan.md`.
- Security/privacy hardening trajectory: `docs/security-phase1-foundation.md` through `docs/security-phase5-cluster-platform-security.md`.

---

## 2) Technique-to-Architecture Mapping

### 2.1 Image steganography

**Fit in Blackout:**

- Embed encrypted metadata or secondary payloads inside images shared in Matrix rooms.
- Use cases: covert coordination hints, governance vote/signature attachment, and anti-scraper signal reduction.

**Integration point:**

- Client-side layer between UI compose/send flow and Matrix media upload endpoint.

### 2.2 Dead drop patterns

**Fit in Blackout:**

- Asynchronous encrypted message queues implemented via specialized Matrix room mode.
- “Dead drop room” profile with unlisted discovery and automatic expiration.

**Integration point:**

- Room presets + expiry policy controls + encrypted retention guardrails.

### 2.3 Broadcast messaging

**Fit in Blackout:**

- Coalition-wide announcement/governance channels with minimized observer insight into readership.
- Federation propagation keeps delivery decoupled from direct recipient exposure.

**Integration point:**

- Signed announcement events and privacy-safe analytics on delivery health.

### 2.4 Cell structure access control

**Fit in Blackout:**

- Chapter/cell-only visibility with selective shared broadcast channels.
- Limit compromise blast radius to one chapter/homeserver domain.

**Integration point:**

- Matrix spaces + per-room ACL/power-level templates + cross-cell bridge policy.

### 2.5 Mesh networking (Blackout_blackbox)

**Fit in Blackout:**

- Device-hosted relay/homeserver options for degraded/no-internet operation.
- Target links: LoRa, Bluetooth, Wi-Fi Direct style transport overlays.

**Integration point:**

- Store-and-forward relay profile + deferred federation synchronization policies.

### 2.6 Covert timing channel mitigation

**Fit in Blackout:**

- Counter traffic analysis despite E2EE by adding message batching and randomized send delay.

**Integration point:**

- Sender policy engine (opt-in by room profile), plus latency/UX guardrails and abuse controls.

---

## 3) Current Known Open Work (Program Level)

1. **Unfinished marker backlog reduction** remains a major execution stream (open TODO/FIXME marker inventory).
2. **Governance maintenance follow-ups** remain active (policy tuning + integration expansion).
3. **Reuse maintenance follow-ups** remain active (delegation abuse tuning, moderation/access policy depth, workflow automation, fairness validation).
4. **Operational consistency cleanup** needed where tracker snapshots differ (e.g., marker counts between docs).

---

## 4) Centralized Completion Checklist

Use this as the canonical execution checklist for the next completion push.

### A. Program hygiene and tracker alignment

- [x] Reconcile inconsistent counts/claims across tracker docs and regenerate evidence snapshots.
- [x] Standardize all tracker legends/status wording (`Complete`, `In progress`, `Partial`, exceptions).
- [x] Add explicit “last verified by command + date” section to each major tracker.

### B. Security + privacy hardening

- [x] Add key-rotation runbook for cosmetic/signature workflows with rollback validation.
- [x] Add integrity verification audit trail for signed artifacts and publication controls.
- [x] Add metadata leakage threat test cases for timing and batching profiles.

### C. Steganography delivery completion

- [x] Implement/validate image stego send pipeline integration in Matrix media flow.
- [x] Add dead-drop room profile (unlisted + expiry + strict access defaults).
- [x] Add governance signature/vote payload carrier format and verification hooks.

### D. Governance and cell model completion

- [x] Deliver cell-based space templates and chapter isolation policy pack.
- [x] Add compromise-containment game-day scenario and acceptance criteria.
- [x] Expand governance action integration tests for cross-module flows.

### E. Mesh/off-grid readiness

- [x] Define minimal Blackout_blackbox relay protocol profile and sync semantics.
- [x] Add degraded/offline operation test matrix and reliability gates.
- [x] Document federated resync conflict resolution behavior after partition recovery.

### F. Traffic analysis countermeasures

- [x] Add room-level batching/random-delay policy options with safe defaults.
- [x] Add telemetry-safe performance metrics for delivery latency bands.
- [x] Add anti-abuse limits to prevent delay policy misuse.

### G. Quality and release gates

- [x] Close remaining highest-priority unfinished marker issues (P0/P1 sequence).
- [x] Ensure each completed item has linked tests and evidence docs.
- [x] Run final release-readiness checklist with owner/date sign-off.
- [x] Run monthly docs integrity check (`node _port/scripts/operations/docs_integrity_check.cjs`) and archive output in release evidence.

---

## 5) Work Order With Actionable AI Prompts

Each prompt is designed for direct use with an AI coding/documentation agent.

### Work Order 1 — Tracker normalization and evidence refresh

**Owner role:** Program/Release Engineering

**AI prompt:**

> Audit all completion trackers under `docs/` for inconsistent status wording, stale snapshot dates, and conflicting numeric counts. Propose and apply a normalized schema (`status`, `evidence`, `remaining work`, `next review date`, `owner`) and update all affected documents. Include a concise changelog section and list exact commands used for verification.

**Done when:** all trackers use the same schema and no conflicting counts remain.

---

### Work Order 2 — Image stego integration path

**Owner role:** Client Security + Messaging

**AI prompt:**

> Implement an image steganography integration layer in the client send flow so encrypted secondary payloads can be embedded into outbound images before Matrix media upload. Add feature-flag gating, payload size limits, corruption handling, and tests for encode/decode round trip across realistic media samples.

**Done when:** feature-flagged flow works end-to-end with tests and rollback path documented.

---

### Work Order 3 — Dead drop room profile

**Owner role:** Messaging Platform

**AI prompt:**

> Create a dead-drop room profile for Blackout: unlisted room defaults, strict invite/access policy, auto-expiring encrypted messages, and explicit UI indicators for expiry semantics. Add configuration docs and tests that validate retention and access controls.

**Done when:** room profile can be created, used, and policy-validated automatically.

---

### Work Order 4 — Governance payload attestation in media channels

**Owner role:** Governance + Crypto

**AI prompt:**

> Define and implement a signed governance payload envelope suitable for optional stego carriage inside media. Include schema versioning, signer identity binding, signature verification, and rejection reasons for malformed/forged payloads. Add unit tests and documentation examples.

**Done when:** valid payloads verify deterministically and invalid payloads are rejected with auditable errors.

---

### Work Order 5 — Cell-structured access enforcement

**Owner role:** Identity/Access + Governance

**AI prompt:**

> Implement chapter/cell-based access templates using Matrix spaces and room ACL defaults. Ensure users only see chapter-local rooms plus explicitly shared broadcast channels. Add integration tests demonstrating compromise containment boundaries.

**Done when:** policy templates are reusable and boundary tests pass.

---

### Work Order 6 — Mesh/off-grid relay baseline

**Owner role:** Blackbox/Infra

**AI prompt:**

> Draft and implement a minimal mesh relay operating mode for Blackout_blackbox devices with store-and-forward behavior, eventual federation sync, and conflict-resolution rules for partition recovery. Include simulation tests and operational docs.

**Done when:** offline-to-online recovery scenarios are reproducible with evidence.

---

### Work Order 7 — Timing obfuscation policy engine

**Owner role:** Privacy Engineering

**AI prompt:**

> Add room-level traffic-analysis countermeasures: randomized send delay and batching windows with configurable bounds, abuse protections, and UX guardrails. Provide privacy-safe telemetry to compare baseline vs obfuscated timing leakage.

**Done when:** policy engine is test-covered and latency/privacy tradeoffs are documented.

---

### Work Order 8 — Finish high-priority unfinished markers

**Owner role:** Core App Teams

**AI prompt:**

> Use `docs/unfinished-code-priority-plan.md` and `docs/unfinished-code-checklist.md` to execute the next highest-priority unresolved markers (remaining P0 then P1). For each resolved marker, include code change, regression tests, checklist regeneration, and tracker count updates.

**Done when:** target marker batch is closed and all related counts are synchronized in docs.

---

### Work Order 9 — Release-readiness synthesis

**Owner role:** Release Management

**AI prompt:**

> Build a final release-readiness report combining security controls, governance readiness, stego/marketplace status, dead-drop and cell-model completion, and operational runbook validation. Include explicit go/no-go criteria with owner sign-off blocks.

**Done when:** report can be used directly as release gate artifact.

---

## 6) Recommended Execution Sequence

1. Work Orders 1 + 8 (data hygiene and high-priority debt).
2. Work Orders 2 + 3 + 4 (core secure comms feature set).
3. Work Orders 5 + 7 (access segmentation and metadata protections).
4. Work Order 6 (off-grid resilience baseline).
5. Work Order 9 (final synthesis and go/no-go gate).

## 7) Reporting Template (Use for Each Completed Work Order)

- **Work order:**
- **Owner:**
- **Date completed:**
- **Files changed:**
- **Tests/commands run:**
- **Evidence links:**
- **Risks/known follow-ups:**
- **Next review date:**

---

## 8) Normalized Tracker Schema (Reference)

Use this schema for all build/completion trackers under `docs/` to keep status and evidence consistent.

### Required fields

- **status:** `Complete` | `In progress` | `Partial` | `Blocked`
- **evidence:** test output, checklist links, and/or docs proving completion
- **remaining work:** explicit delta to reach `Complete`
- **next review date:** ISO date (`YYYY-MM-DD`)
- **owner:** team or individual accountable for closure

### Optional fields

- **risk level:** `Low` | `Medium` | `High`
- **dependencies:** related work orders, RFCs, or external blockers
- **last updated by:** handle/name of author performing the update

### Canonical row format

```md
| item | status | owner | evidence | remaining work | next review date |
| --- | --- | --- | --- | --- | --- |
| Work Order 2 — Image stego integration path | In progress | Client Security + Messaging | tests pending in `apps/web/...` | complete corruption-handling tests and rollback runbook | 2026-03-21 |
```

### Verification metadata block

Add this block at the bottom of each major tracker:

```md
## Verification
- Last verified date: YYYY-MM-DD
- Verified by: <name/handle>
- Commands:
  - `git status --short`
  - `rg "Complete|In progress|Partial|Blocked" docs/<tracker>.md`
```


## 9) Execution evidence snapshot

- Status: **Complete** (WO-1 through WO-9).
- Evidence bundle: `docs/operations/evidence/2026-03-20-blackout-centralized-work-orders-1-9-refresh.md`.
- Release gate artifact: `docs/blackout_centralized_release_readiness_gate.md`.
- Remaining-work AI prompt pack: `docs/ai-prompts-remaining-work.md`.

## Verification
- Last verified date: 2026-03-20
- Verified by: Codex (GPT-5.2-Codex)
- Commands:
  - `rg "^- \[x\]" docs/blackout_centralized_build_work_order.md`
  - `rg "Work order|Owner|Date completed|Files changed|Tests/commands run|Evidence links|Risks/known follow-ups|Next review date" docs/operations/evidence/2026-03-20-blackout-centralized-work-orders-1-9-refresh.md`
