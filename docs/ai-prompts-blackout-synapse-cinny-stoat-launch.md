# Blackout Single-Server Launch (Synapse + Cinny + Stoat-Inspired UX)

**Prepared:** April 13, 2026  
**Audience:** Tyree Roberson + AI coding/ops agents  
**Purpose:** End-to-end, prompt-driven execution plan to launch `theblackout.app` using a Matrix-native stack while keeping customizations modular and reusable.

---

## 1) Context and non-negotiable architecture decisions

Use these as fixed constraints in every AI run:

1. **Homeserver choice is Synapse.**
2. **Frontend base is Cinny (`apps/blackout-client`).**
3. **Stoat is reference-only for UX patterns** (layout, navigation density, community ergonomics), not runtime/protocol/backend dependency.
4. **Matrix owns transport + identity + federation.**
5. **Blackout services own product logic** (community abstraction, roles/policy, moderation workflows, automation, marketplace, dispatch, optional voice coordination).
6. **Do not hard-merge Cinny and Stoat codebases.**
7. **Reset broken frontend customizations into modular feature plugins** for long-term reuse.

### Domain decisions for this launch

- Matrix server identity: `theblackout.app`
- Client web app: `chat.theblackout.app`
- Recommended additional operational endpoints:
  - `matrix.theblackout.app`
  - `api.theblackout.app`
  - `turn.theblackout.app`

---

## 2) End-state target topology

```text
Internet
  ↓
Nginx or Caddy
  ├ chat.theblackout.app    → Blackout frontend (Cinny-based)
  ├ matrix.theblackout.app  → Synapse homeserver
  ├ api.theblackout.app     → Blackout API/service layer
  └ turn.theblackout.app    → coturn (recommended for call reliability)

Blackout frontend shell
  ↓
Blackout community abstraction + feature plugins
  ↓
Blackout services (roles/policy, moderation, automation, marketplace/dispatch)
  ↓
Synapse + Postgres + storage
```

---

## 3) Orchestrator prompt (run first)

Use this with your primary AI coordinator agent:

```text
You are the principal delivery orchestrator for a production launch.

Goal:
Launch Blackout on a single server using:
- Synapse as homeserver
- Cinny-based frontend at apps/blackout-client
- Blackout service layer for product logic
- Stoat-inspired UX patterns (reference only)

Domain plan:
- server_name: theblackout.app
- chat.theblackout.app frontend
- matrix.theblackout.app homeserver endpoint
- api.theblackout.app service layer
- turn.theblackout.app coturn

Critical constraints:
- Do NOT merge Stoat backend/protocol/runtime into Matrix client path.
- Keep Matrix-first compatibility and federation readiness.
- Move all existing frontend customizations into modular plugin/feature boundaries.
- Do not leave hardcoded shell hacks.

Output required:
1) Week-by-week execution plan (infra, backend, frontend, ops)
2) Detailed task list with file paths
3) Acceptance criteria per task
4) Rollback plan per risky change
5) Smoke/regression test matrix
```

---

## 4) Infrastructure prompts

## 4.1 DNS + TLS + reverse proxy prompt

```text
Act as a senior platform engineer.

Create production-ready DNS and reverse-proxy implementation for:
- theblackout.app
- chat.theblackout.app
- matrix.theblackout.app
- api.theblackout.app
- turn.theblackout.app

Requirements:
- Synapse behind reverse proxy with X-Forwarded-* headers.
- Preserve Matrix path semantics (no URI normalization/canonicalization that breaks signatures).
- TLS certificates and automated renewal.
- Security headers for frontend.
- Host-based routing for chat/matrix/api/turn.

Deliverables:
- Nginx or Caddy config files
- deployment instructions
- certificate automation steps
- validation commands and expected outputs
```

## 4.2 Single-server compose/systemd prompt

```text
Act as an SRE creating a one-server production baseline.

Create deployment manifests for:
- blackout frontend static app
- Synapse
- Blackout API
- Postgres
- Redis
- coturn

Requirements:
- Healthchecks for each service
- restart policies
- persistent volume layout
- least-privilege networking
- backup hooks for DB/media/config

Output:
- Compose files and/or systemd units
- .env templates
- startup order
- runbook for deploy, rollback, and disaster recovery
```

---

## 5) Synapse prompts

## 5.1 Synapse launch config prompt

```text
Act as a Matrix/Synapse operator.

Configure Synapse for production with:
- server_name: theblackout.app (immutable after launch)
- public_baseurl aligned with reverse proxy
- registration policy appropriate for launch
- media/upload limits
- trusted key server defaults
- rate-limits for abuse resistance
- TURN integration (turn_uris + shared secret)

Deliver:
- config diff or full config template
- explanation of each non-default setting
- checklist for first admin bootstrap
- federation sanity checks
```

## 5.2 Synapse verification prompt

```text
Create a launch verification script/checklist for Synapse.

Must validate:
- login/register behavior
- sync success
- room/space creation
- DM messaging
- media upload limits
- account recovery flow
- federation readiness (if enabled)

Output:
- executable commands
- expected successful output signatures
- failure triage paths
```

---

## 6) Frontend reset-and-modularize prompts (critical)

## 6.1 Fresh-start reset prompt

```text
You are a principal frontend architect.

The current customized frontend is unstable (spacing, location, function regressions).
Reset to clean Cinny baseline in apps/blackout-client, then reintroduce custom behavior via modular features/plugins only.

Rules:
- No ad hoc shell hacks.
- Every customization must map to a feature module/plugin boundary.
- Keep shell extension points minimal and documented.
- Preserve Matrix compatibility.

Deliverables:
1) migration inventory table (old customization → new module)
2) staged migration PR plan
3) file-level refactor plan
4) regression test plan
```

## 6.2 Plugin boundary prompt

```text
Define and implement plugin boundaries in apps/blackout-client.

Each customization must be categorized as:
- visual/layout plugin
- interaction plugin
- workflow plugin
- service-backed plugin

Use/extend feature registry and manifests for route/nav/settings contributions.
Avoid direct hardcoded route/nav registration where possible.

Output:
- module folder structure
- manifest contracts
- capability gate strategy
- examples for 3 migrated customizations
```

## 6.3 Stoat-inspired UX prompt (reference-only)

```text
Design Stoat-inspired UX for Blackout without importing Stoat runtime dependencies.

Implement:
- community-first navigation shell
- denser channel discovery
- role-rich member surfaces
- onboarding flow improvements

Keep:
- Matrix room/space semantics under the hood
- Blackout language in UI labels
- accessibility and keyboard flows intact

Output:
- wireframe-level route map
- component inventory
- migration sequence with low-risk first
```

---

## 7) Service-layer prompts

## 7.1 Service contracts prompt

```text
Act as a backend platform architect.

Define service contracts for Blackout-owned logic:
- community service
- role/policy mapper
- moderation workflows
- automation gateway
- optional voice session coordination
- marketplace/dispatch surfaces (scaffold if needed)

Requirements:
- typed contracts for frontend SDK consumption
- audit logging for critical actions
- authorization boundaries by role/capability
- clear separation from Matrix room-state transport concerns

Output:
- endpoint map
- request/response schemas
- SDK method map
- threat and abuse controls checklist
```

## 7.2 Frontend SDK integration prompt

```text
Move direct frontend network calls into shared SDK actions.

For each migrated feature plugin:
- replace ad hoc fetch usage with typed SDK methods
- add retry/error surface patterns
- define loading and failure UI states

Output:
- migration diff plan
- updated API client interfaces
- unit tests for contracts and adapters
```

---

## 8) Calls/voice prompts

## 8.1 TURN + call reliability prompt

```text
Implement TURN-backed call reliability for launch.

Tasks:
- configure coturn with secure defaults
- bind Synapse TURN settings
- validate 1:1 call path
- validate group call path
- document degraded-mode behavior when TURN is unavailable

Output:
- coturn config checklist
- firewall/port matrix
- call test matrix
- incident response quick-actions
```

---

## 9) Security + operations prompts

## 9.1 Security hardening prompt

```text
Apply launch security baseline for single-server deployment.

Include:
- public surface minimization
- admin route lockdown
- rate limits (login/registration/media/federation ingress)
- secret rotation policy
- TLS expiry alerting
- bot abuse mitigation runbook integration

Output:
- security controls table
- implementation checklist
- verification steps with commands
```

## 9.2 Backups + monitoring prompt

```text
Build production operations baseline.

Must include:
- database backups with restore verification
- media backup policy
- config/env backup handling
- uptime checks and alert routing
- CPU/memory/disk/log dashboards
- release gate checks

Output:
- cron/workflow jobs
- restore drill procedure
- on-call handoff checklist
- weekly/monthly/quarterly evidence cadence
```

---

## 10) QA, release, and rollback prompts

## 10.1 Launch smoke suite prompt

```text
Create launch smoke suite for:
- auth login/recovery
- room and DM messaging
- media upload
- moderation action
- basic governance path
- call flow with TURN

Output:
- test cases (manual + automated)
- pass/fail criteria
- release-blocker severity definitions
```

## 10.2 Rollback prompt

```text
Create rollback plan for every high-risk deployment unit:
- proxy config
- Synapse config
- frontend shell and plugins
- API/service schema changes
- TURN and call path changes

Output:
- rollback trigger criteria
- exact rollback commands
- post-rollback validation checklist
```

---

## 11) Prompt usage order (strict)

Run prompts in this sequence:

1. Orchestrator prompt
2. DNS/TLS/Proxy prompt
3. Compose/systemd prompt
4. Synapse config + verification prompts
5. Frontend reset prompt
6. Plugin boundary prompt
7. Stoat-inspired UX prompt
8. Service contracts prompt
9. SDK integration prompt
10. TURN prompt
11. Security hardening prompt
12. Backups + monitoring prompt
13. Smoke suite prompt
14. Rollback prompt

Do not skip order. Infra and Synapse decisions must be fixed before frontend integration and QA signoff.

---

## 12) Definition of done (launch gate)

Launch is approved only when all are true:

- Domain/proxy/TLS topology is live for chat/matrix/api/turn.
- Synapse is stable with correct `server_name` and baseline security controls.
- Frontend customizations are modularized into feature/plugin boundaries.
- No critical behavior depends on brittle shell edits.
- Service-layer contracts are documented and consumed via SDK.
- TURN-backed call reliability is verified.
- Backup/restore and monitoring/alerting are proven.
- Smoke suite passes with documented evidence and rollback readiness.

---

## 13) Anti-patterns to reject in code review

Reject any PR that:

- hard-merges Stoat backend/runtime into Matrix path,
- encodes Blackout business logic directly as ad hoc Matrix room-state dependencies,
- adds non-modular shell hacks for layout/function behavior,
- bypasses SDK/contracts with direct untyped feature fetches,
- ships infrastructure changes without rollback steps.

---

## 14) Working-note template for each AI task

Use this mini-template in every AI-driven task ticket:

```text
Task:
Scope:
Files touched:
Risk level:
Acceptance criteria:
Test plan:
Rollback plan:
Evidence links:
```

This keeps AI output operationally useful and merge-safe.
