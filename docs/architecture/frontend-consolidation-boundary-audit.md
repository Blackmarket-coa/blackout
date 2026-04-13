# Frontend Consolidation Boundary Audit

Assessment source: `docs/architecture/frontend-consolidation-assessment.md`  
Work-doc source: `docs/architecture/frontend-consolidation-work-doc-ai-prompts.md`

## Scope audited

Targeted migration areas reviewed for UI/backend boundary compliance:
- `apps/blackout-client/src/app/features/governance`
- `apps/blackout-client/src/app/features/deaddrop`
- `apps/blackout-client/src/app/features/forum`
- `apps/blackout-client/src/app/features/moderation`
- `apps/blackout-web/src/app.ts` (migration-shell reference)

Boundary policy applied:
- UI components/hooks should not directly couple to backend/network/event transport.
- Integrations should flow through `@blackout/sdk` actions/adapters.
- Event names/contracts should come from `@blackout/protocol`.

---

## Findings

| ID | Area | Finding | Risk | Status |
|---|---|---|---|---|
| BND-001 | Governance hooks | `useCastVote` and `useCreateProposal` were directly writing Matrix events from feature hook logic. | UI/backend coupling and event-shape drift risk. | **Fixed** |
| BND-002 | Dead-drop hooks | `useSetDeadDrop` and queue actions directly called `sendStateEvent` with inline event constants. | UI/backend coupling; duplicate event contract definitions. | **Fixed** |
| BND-003 | Event contracts | Governance/dead-drop Matrix event constants were local-only and not centralized in protocol package. | Cross-runtime event contract drift. | **Fixed** |
| BND-004 | Forum/moderation hooks | Remaining direct Matrix coupling exists in forum/moderation hooks and Draupnir client surfaces. | Ongoing boundary exceptions until SDK adapters are introduced. | **Open exception** |
| BND-005 | blackout-web monolith | `apps/blackout-web/src/app.ts` still centralizes service wiring and persistence concerns in a monolith shell class. | Harder incremental extraction to SDK/protocol boundaries. | **Open exception** |

---

## Implemented fixes

### 1) Moved governance write-path integration behind `@blackout/sdk`

Implemented `createGovernanceMatrixActions` in SDK and updated governance hooks to call SDK actions instead of directly invoking transport calls in UI hook bodies.

- Added SDK governance matrix action adapter:
  - `packages/blackout-sdk/src/governance/matrixActions.ts`
- Updated governance hook integration:
  - `apps/blackout-client/src/app/features/governance/useProposals.ts`

### 2) Moved dead-drop write-path integration behind `@blackout/sdk`

Implemented `createDeadDropMatrixActions` and updated dead-drop hooks for config updates and queue commands.

- Added SDK dead-drop matrix action adapter:
  - `packages/blackout-sdk/src/deaddrop/matrixActions.ts`
- Updated dead-drop hook integration:
  - `apps/blackout-client/src/app/features/deaddrop/useDeadDrop.ts`

### 3) Centralized event constants/contracts in `@blackout/protocol`

Added governance/dead-drop event constants to protocol package and consumed them from frontend code paths.

- `packages/blackout-protocol/src/governance/events.ts`
- `packages/blackout-protocol/src/deaddrop/events.ts`

### 4) SDK surface exports

Exported new boundary adapters and matrix client interface from SDK package index.

- `packages/blackout-sdk/src/matrix/types.ts`
- `packages/blackout-sdk/src/index.ts`

---

## Boundary exceptions (documented)

| Exception ID | Location | Why still coupled | Owner | Target date |
|---|---|---|---|---|
| EXC-001 | `apps/blackout-client/src/app/features/forum/useForum.ts` | Direct `sendStateEvent` remains; forum matrix adapter not yet implemented in SDK. | Frontend Core Team | 2026-04-24 |
| EXC-002 | `apps/blackout-client/src/app/features/moderation/{AutoModPanel.tsx,TimeoutDialog.tsx,draupnir/DraupnirClient.ts}` | Moderation actions still call matrix client directly; requires phased SDK adapter rollout. | Frontend Moderation Team | 2026-05-01 |
| EXC-003 | `apps/blackout-web/src/app.ts` | Migration shell architecture is monolithic; extraction to feature modules still pending. | Frontend Platform Team | 2026-05-08 |

---

## Validation run log

Commands requested by work doc:

- `pnpm lint`
- `pnpm test` (targeted suites)

(Executed in this pass; statuses captured in the final response.)

## Conclusion

- Governance and dead-drop write-path integrations were updated to use `@blackout/sdk` adapters and `@blackout/protocol` event constants.
- Remaining direct-coupling areas are explicitly documented as boundary exceptions with owners and dates.
