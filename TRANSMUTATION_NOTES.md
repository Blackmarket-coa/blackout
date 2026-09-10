# Transmutation review — what it found in this repo

Part of the 2026-09-09 transmutation-strategy reconciliation. The canonical
document — the full reconciliation of the joint-stock/growth brief against all
three repositories, with the corrections table, the legal gates and the ordered
roadmap — is `docs/TRANSMUTATION_STRATEGY.md` in
`Blackmarket-coa/free-black-market`. This file records only the findings that
land in Blackout, so they are visible from the repo they affect.

No code rides with this file.

## 1. `ProposalEngine` and `VotingEngine` do not exist

The strategy brief named them as existing Blackout features and proposed a
"governance sunset date" when they activate. Neither name exists as a class or
file in any of the three repos. They survive in this repo's own documentation —
`docs/blackout-governance-build-plan.md` names
`src/services/governance/ProposalEngine.ts` and `VotingEngine.ts`,
`docs/blackout-governance-completion-tracker.md` still asserts they exist, and
an operations evidence file cites `_port/src/services/governance/VotingEngine.ts`
against a `_port/` tree that is not in the checkout.

What is real is proposal and vote code in four parallel implementations, which
`CONSOLIDATION.md` already calls out for reconciliation onto one:

-   `packages/core/src/governance/index.ts` — `tallyVotes()`, reputation thresholds
-   `apps/blackout-client/src/app/features/governance/useProposals.ts`
-   `packages/api/src/modules/governance.ts`, mounted at `/governance`
-   `packages/blackout-protocol/src/governance/contracts.ts` — `co.bmc.proposal`, `co.bmc.vote`

All of it is scoped to a Matrix room. None of it is platform-scoped. FBM's
`docs/MEMBER_GOVERNANCE.md` already records that coalition-wide member voting
"does not exist" and that "no surface should say the platform is
member-governed" until it does. **The recommendation is to drop the
`ProposalEngine`/`VotingEngine` naming from the docs that still assert it, and
to commit to preconditions rather than to a sunset date.** See the canonical
document §5.4.

## 2. Two governance defects to fix before any surface says "democratic"

-   ~~**No majority test.**~~ **Fixed 2026-09-10.** `useProposals.ts` marked a
    proposal `passed` on expiry if turnout met quorum; `leadingOptionId` was
    computed and discarded, so a binary proposal on which every vote was
    "against" passed. Turning out to vote a proposal down passed it.

    The tally and the decision are now in `lib/bmc-core/proposalTally.ts`, beside
    the consent equivalents — consent was the one method already implemented
    correctly (`lib/bmc-core/consent.ts:140-143`) and it is the model. A proposal
    must now clear two independent bars at its deadline: quorum, _and_ an option
    actually winning. For a binary proposal the winner must be the affirmative
    option, read by id (`yes`) rather than by position, since the creator lets a
    proposer reorder those options but not rename their ids. A dead heat selects
    nothing and reads as `failed`, the status union having no `tie` member.
    Sixteen tests, none of which needed a Matrix room — which is the point of
    extracting it.

-   ~~**"Ranked" is Borda scoring, not instant-runoff.**~~ **Named honestly
    2026-09-10.** Position weighting with no elimination rounds is Borda. Rather
    than implement IRV — a bigger change than this pass, and arguably the wrong
    default for a consent-first product — the vote-type selector now reads
    "Ranked (Borda score)" and explains the consequence in the creator: a
    broadly-acceptable second favourite can beat the option most people ranked
    first. A test demonstrates exactly that outcome, so the copy cannot drift
    from the arithmetic.

## 3. `apps/blackout-gov` is an inert shell

Five source files; `mount()` writes `innerHTML` and there are no event
listeners, click handlers or fetch calls anywhere in `src/`. The "Create
proposal", "Approve" and "Block" buttons are static HTML, and the figures
shown (a 142,300 treasury, 58 delegations, 81% participation) are hardcoded
defaults. Its only build reference is a CI test filter; it appears in no
compose file, Dockerfile, Railway config or deploy workflow. `CONSOLIDATION.md`
already calls it migration residue. **Delete it or finish it** — a governance
demo with invented participation numbers is the wrong thing to have lying
around while the brief proposes governance as a recruitment mechanism.

## 4. A live copy promise that is a safety claim

`apps/blackout-client/src/app/features/home/widgets/premiumWidgets.tsx:21-22`
renders "🟢 Anonymized transport (Tor) — active" under a heading that calls it
"Live status", to paying users. `features/privacy-tools/useHardeningFeatures.ts:6-7`
records that Tor transport and decoy traffic "remain planned", and
`packages/blackout-sdk/src/hardening/entitlementGate.ts:9` says the same. There
is no SOCKS or onion routing code in the repo.

This is not a marketing overclaim like the others in the canonical document's
§5.6a. It is a representation about network anonymity, made to people who may
make decisions about what they say and to whom on the strength of it. **Change
the copy before anything else in this file.**

## 5. BO-1 is still the gating item for anything trust-critical

`KNOWN_ISSUES.md` BO-1 — key-backup `DecryptionError` / unable-to-decrypt
history — remains open. The instrumentation added on 2026-08-31
(`src/client/encryptionHealth.ts`) now classifies each report among the three
candidate causes (backup setup never completing, restore failing, cross-signing
state) and the suppressed-log wrapper counts what it drops, but the underlying
failure is undiagnosed and needs live-fleet numbers.

Everything in the strategy that routes trust through Blackout — encrypted
customer messaging as a commerce differentiator, mutual-aid posts carrying
precise coordinates, governance — sits behind this. Public surfaces that make
no confidentiality claim (a Coliseum debate, a public den) do not. `TRUST.md`
should be read against BO-1 and reconciled.

## 6. What Blackout already contributes that the brief undercounted

The Documents feature (`apps/blackout-client/src/app/features/documents/templates/index.ts`)
seeds four founding documents — bylaws, mission, decision rules, mutual-aid
agreement — adapted from SELC, USFWC and Center for Family Life with licence
attribution. The canonical document's §6 lists cold-start content that a human
must author before community iteration can begin; the co-op-formation half of
that list is already paid for here. The remaining work is export and linkage,
per FBM's `docs/CDFI_COOP_ROADMAP.md` §3.4, not authorship.
