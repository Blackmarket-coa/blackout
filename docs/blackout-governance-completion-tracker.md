# Blackout Governance Build Plan Completion Tracker

> **Correction (2026-09-10). This tracker measured a tree that no longer
> exists, and its headline figure was never true of this repository.**
>
> Every "Complete" row below cites evidence under `_port/src/` — a fork tree
> imported during the migration. `_port/` was **decommissioned in `204b6bacd`
> on 2026-05-05** ("chore(repo): decommission `_port/`, legacy/element,
> legacy/web, packages/web, packages/server, migration/"), four days after the
> scope note beneath this one was added acknowledging that `_port/` was not the
> canonical runtime. The tree was then deleted and the tracker was never
> revisited, so "Completed phases: 8 / 8 — Overall completion: **100%**" has
> stood since May against paths that cannot be opened. Not one of
> `src/services/crdt/documentManager.ts`, `src/services/crdt/yjsProvider.ts`,
> `ProposalEngine`, `VotingEngine`, `DelegationGraph`, `attestationGraph`,
> `src/modules/education`, `src/modules/mutualAid`,
> `src/services/deliberation/clustering.ts` or `src/services/storage/ipfsService.ts`
> exists in this checkout; neither does the top-level `src/` tree they all
> assume.
>
> The **Canonical state** column below is what is actually in the repository,
> checked file by file on 2026-09-10 rather than inferred from a module name.
> Three of the eight phases have a real implementation in the canonical
> runtime, in a different shape from the one the build plan specified. Four
> have none. Read that column; the Evidence column is kept only so the record
> of what was claimed is not quietly erased.
>
> `ProposalEngine` and `VotingEngine` in particular are named as existing by
> several documents in `docs/` and exist in none of the three repositories —
> see `TRANSMUTATION_NOTES.md` §1, and the correction already carried by
> `docs/features/circle-reach-feed.md`.

> **Scope note (2026-05-01):** the "Complete" rows below reference evidence
> in the imported `_port/src/` fork tree (e.g. `src/services/crdt/...`,
> `src/modules/education`). That tree is **not** the canonical runtime;
> `apps/blackout-client/` is. Whether each governance phase is also live in
> the canonical client is tracked separately in
> `docs/architecture/frontend-consolidation-migration-backlog.md`. The
> apps/blackout-gov shell is still in flight (delegation management, treasury,
> analytics, simplified view). Treat this tracker as the build-plan parity
> view against `_port/`, not as a frontend-consolidation status board.

This tracker maps the implementation status in this repository to the phases defined in `docs/blackout-governance-build-plan.md`.

## Status legend

-   Complete
-   In progress
-   Partial
-   Blocked

## Phase progress

| Phase   | Scope                              | Claimed status | Claimed evidence (`_port/`, deleted 2026-05-05)                                          | Canonical state, verified 2026-09-10                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------- | ---------------------------------- | -------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 0 | Discovery and scaffolding          | Complete       | Feature flags, module/service skeletons, telemetry hooks, ADR.                           | **Unverifiable.** The tree it describes is gone; nothing here can be checked either way.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Phase 1 | CRDT core (Yjs)                    | Complete       | `src/services/crdt/documentManager.ts`, `yjsProvider.ts`, `types.ts`.                    | **Absent.** `yjs` is not a dependency of any package and appears zero times in `pnpm-lock.yaml`. There is no CRDT layer to point at.                                                                                                                                                                                                                                                                                                                                                                                     |
| Phase 2 | Governance MVP                     | Complete       | `ProposalEngine`, `VotingEngine`, views, navigation.                                     | **Present, in a different shape.** `apps/blackout-client/src/app/features/governance/` (proposal card/creator/detail, consent tally, dashboard, treasury, meetings, roles), `packages/api/src/modules/governance.ts` mounted at `/governance`, `packages/core/src/governance/index.ts`, and `co.bmc.proposal` / `co.bmc.vote` in `packages/blackout-protocol/src/governance/contracts.ts`. Neither named engine exists; these are **four parallel implementations** `CONSOLIDATION.md` already flags for reconciliation. |
| Phase 3 | Delegation + attestations          | Complete       | `DelegationGraph`, `attestationGraph`, delegation/attestation panel, delegated tallying. | **Absent.** Neither name exists. The repository's "delegation" hits are playbook leadership (`lib/bmc-core/playbook.ts`, `LeadershipGlyph.tsx`) and its "attestation" hits are WebAuthn (`packages/api/src/services/webauthn.ts`) — different subjects that happen to share a word.                                                                                                                                                                                                                                      |
| Phase 4 | Education module                   | Complete       | `src/modules/education`.                                                                 | **Present, in a different shape.** `packages/blackout-protocol/src/education/{contracts,events}.ts`, `packages/blackout-sdk/src/education/actions.ts`, and `apps/blackout-client/src/app/features/education/` with `EducationPage.tsx`.                                                                                                                                                                                                                                                                                  |
| Phase 5 | Mutual aid board                   | Complete       | `src/modules/mutualAid`.                                                                 | **Present, in a different shape.** `packages/core/src/coalition/mutualAid.ts` and `apps/blackout-client/src/app/features/deaddrop/MutualAidPage.tsx` with its routes, panels and settings, under test.                                                                                                                                                                                                                                                                                                                   |
| Phase 6 | Deliberation clustering (optional) | Complete       | `src/services/deliberation/clustering.ts`.                                               | **Absent.** No clustering code anywhere in the checkout.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Phase 7 | IPFS storage (optional)            | Complete       | `src/services/storage/ipfsService.ts`.                                                   | **Absent.** No IPFS integration anywhere in the checkout.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## Completion summary

**Superseded 2026-09-10.** The figures this section carried — "Completed
phases: 8 / 8", "Overall completion: **100%**" — counted phases against a tree
that was deleted from the repository on 2026-05-05, and are left here only as
the record of what was claimed.

Against the canonical runtime, verified file by file:

-   **Present** (in a shape other than the build plan's): Phases 2, 4, 5 — 3 of 8.
-   **Absent**: Phases 1, 3, 6, 7 — 4 of 8. Two of those (6, 7) were marked optional.
-   **Unverifiable**: Phase 0, being scaffolding in a tree that no longer exists.

No percentage is offered in place of the old one. The phases are not
equivalent units of work, and a single number is what let this document assert
completeness for four months without anyone opening a file.

## Exit-criteria audit artifact

-   Latest pre-rollout audit: `docs/blackout-governance-exit-criteria-audit.md` (2026-02-18).

## Next review checklist

Both boxes were ticked and neither holds. The first was never done against
this repository — no phase can have been validated against exit criteria in a
tree that was deleted. The second is contradicted by the tracker itself:
`_port/` went away on 2026-05-05 and nothing here moved.

-   [ ] Validate each phase against the corresponding exit criteria in the build plan before external rollout.
-   [ ] Keep this tracker updated when scope or status changes.

## Review log

-   2026-02-18: Re-ran phase validation commands listed in the exit-criteria audit and confirmed all phases remain at Complete status with no scope regressions. — **This entry does not survive scrutiny.** See Verification: the commands recorded for this tracker read only the tracker, so "confirmed all phases remain at Complete" confirms that the word "Complete" is still typed here, not that anything was built.
-   2026-09-10: Corrected. Every cited path opened; the evidence tree was found to have been deleted on 2026-05-05; the phase table now carries a verified canonical-state column and the headline percentage is withdrawn.

## Dated status snapshot (2026-03-14)

**Superseded — see the Completion summary above.** Kept as the record of what
was claimed on the date it was claimed:

-   Snapshot result: **100% complete**.
-   Remaining unchecked items: **none**.

### Weekly program sync cadence

-   Cadence: every Wednesday governance/reuse program sync.
-   Owner: Governance Program Lead.
-   Next review date: 2026-03-21.

### Approved exception notes (dated)

| Item                                                 | Exception type                     | Owner                   | Dependency | Next review date | Approval date |
| ---------------------------------------------------- | ---------------------------------- | ----------------------- | ---------- | ---------------- | ------------- |
| Policy tuning follow-ups (quorum/threshold defaults) | Complete (closed maintenance item) | Governance Domain Owner | None       | 2026-03-28       | 2026-03-14    |
| New governance-action integration test expansion     | Complete (closed maintenance item) | QA/Automation Owner     | None       | 2026-03-28       | 2026-03-14    |

### Exception closure evidence (2026-03-14)

-   Implemented operator-safe quorum/supermajority policy tuning controls and defaults in governance voting services.
-   Expanded governance integration tests to cover bounded-policy behavior and additional governance-action paths.
-   Evidence: `docs/operations/evidence/2026-03-14-governance-maintenance-exceptions-closure.md`.

## Verification

**The 2026-03-14 verification could not have failed.** It is preserved below
because how this document stayed wrong matters as much as that it was:

-   Last verified date: 2026-03-14
-   Verified by: Codex (GPT-5.2-Codex)
-   Commands:
    -   `git diff -- docs/blackout-governance-completion-tracker.md`
    -   `rg "Complete|In progress|Partial|Blocked" docs/blackout-governance-completion-tracker.md`

Both commands read **this file**. The first shows whether the tracker was
edited; the second greps the tracker for the status words the tracker itself
contains. Neither opens a single file the tracker cites, so a tracker claiming
completeness against paths that do not exist passes them exactly as a correct
one would. A verification step that cannot distinguish the two is not a check.

### Verification, 2026-09-10

-   Every path in the "Claimed evidence" column opened directly; all absent, as
    is the top-level `src/` tree they assume.
-   `_port/` confirmed removed in `204b6bacd` (2026-05-05), not merely
    non-canonical.
-   Each name (`ProposalEngine`, `VotingEngine`, `DelegationGraph`,
    `attestationGraph`, `DelegatedVotingEngine`, `documentManager`,
    `yjsProvider`) searched across all `.ts`/`.tsx` outside `node_modules` and
    `docs/`: zero hits each.
-   `yjs` searched across every `package.json` and `pnpm-lock.yaml`: zero.
-   Each "Present" claim made only after opening the files named for it — the
    same rule the Phase 3 row exists to illustrate, where a name match on
    "delegation" and "attestation" would have produced two false positives.

Anything added to this tracker should be verifiable by someone who opens the
files, and the commands recorded should be the ones that do that.
