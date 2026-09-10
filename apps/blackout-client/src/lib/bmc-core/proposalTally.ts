import type { GovernanceProposalOption, GovernanceProposalType } from '@blackout/protocol';

/**
 * Vote tallying and the decision predicate for non-consent proposals.
 *
 * Extracted from `useProposals.ts`'s `useProposalResult`, where it lived
 * inside a `useMemo` behind two Matrix adapters and could not be tested. It is
 * the counterpart to `consent.ts` — the one method that was already
 * implemented correctly — and it is here for the same reason: a tally is a
 * pure function of ballots, and the rule that decides an outcome should be
 * readable and testable on its own.
 *
 * The defect this replaces: `computedStatus` was
 * `quorumReached ? 'passed' : 'failed'`. Turnout alone decided, and
 * `leadingOptionId` was computed and then discarded. A binary proposal on
 * which every single vote was "No" passed, so long as enough people showed up
 * to vote it down. See docs/TRANSMUTATION_STRATEGY.md §5.4 in the FBM repo.
 */

export type VoteProposalType = Exclude<GovernanceProposalType, 'consent'>;

/** A single ballot: one option id, or an ordering of them for `ranked`. */
export type BallotChoice = string | string[];

export interface OptionResult {
    optionId: string;
    count: number;
}

export interface VoteTally {
    /** Every option with its score, highest first. Ties keep ballot order. */
    optionResults: OptionResult[];
    voteCount: number;
    quorumReached: boolean;
    /** The single highest-scoring option, or null if nothing leads. */
    leadingOptionId: string | null;
    /** True when the top two options are level, so nothing was chosen. */
    tied: boolean;
}

/**
 * The affirmative option of a binary proposal.
 *
 * `ProposalCreator` fixes a binary proposal's two options at the ids `yes` and
 * `no` — it will not let a proposer add or remove them, only relabel and
 * reorder — so the id is the reliable handle and position is not. The
 * positional fallback is for ballots that did not come from that creator
 * (federated rooms, older schema versions), where first-listed is the best
 * available reading of "the thing being proposed".
 */
export const AFFIRMATIVE_OPTION_ID = 'yes';

export function affirmativeOptionId(options: readonly GovernanceProposalOption[]): string | null {
    const explicit = options.find((option) => option.id === AFFIRMATIVE_OPTION_ID);
    if (explicit) return explicit.id;
    return options[0]?.id ?? null;
}

/**
 * Score each option.
 *
 * A single-choice ballot is one point. A `ranked` ballot is scored by
 * position — first preference on a ballot of n options scores n, the next
 * n-1, and so on down to 1.
 *
 * **This is Borda scoring, not instant-runoff.** There are no elimination
 * rounds, so it is not the "ranked choice" most people mean by that phrase,
 * and no surface should call it that. Borda can elect a broadly-acceptable
 * second-favourite over a first-preference majority winner; that is a property
 * of the method, not a bug in this function, but it is a property the room
 * should be told about rather than have hidden behind a familiar name.
 */
export function tallyProposalVotes(input: {
    type: VoteProposalType;
    options: readonly GovernanceProposalOption[];
    votes: ReadonlyArray<{ choice: BallotChoice }>;
    quorum: number;
}): VoteTally {
    const { type, options, votes, quorum } = input;

    const byOption = new Map<string, number>();
    options.forEach((option) => byOption.set(option.id, 0));

    votes.forEach((vote) => {
        if (typeof vote.choice === 'string') {
            byOption.set(vote.choice, (byOption.get(vote.choice) ?? 0) + 1);
            return;
        }

        vote.choice.forEach((choice, index) => {
            const weight = type === 'ranked' ? Math.max(1, vote.choice.length - index) : 1;
            byOption.set(choice, (byOption.get(choice) ?? 0) + weight);
        });
    });

    const optionResults = [...byOption.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([optionId, count]) => ({ optionId, count }));

    const [first, second] = optionResults;

    // Nothing leads a proposal nobody voted on, and nothing leads a dead heat.
    const hasVotes = (first?.count ?? 0) > 0;
    const tied = hasVotes && second !== undefined && first.count === second.count;

    return {
        optionResults,
        voteCount: votes.length,
        quorumReached: votes.length >= quorum,
        leadingOptionId: hasVotes && !tied ? first.optionId : null,
        tied,
    };
}

/**
 * Decide a non-consent proposal's status, the counterpart to
 * `deriveConsentStatus`.
 *
 * A proposal stays `active` until its deadline. At the deadline it must clear
 * two independent bars, and clearing only the first is what the old code
 * mistook for passing:
 *
 *   1. **Quorum** — enough of the room turned out for the result to mean
 *      anything.
 *   2. **A winner** — one option actually came out ahead. For a binary
 *      proposal that must be the affirmative option: "No" winning is the room
 *      rejecting the proposal, not the proposal passing. For a
 *      multiple-choice or ranked proposal it means one option leads
 *      outright; a dead heat selects nothing.
 *
 * The status union has no "tie" member, so an unresolved outcome reads as
 * `failed`: nothing was decided, and the proposal did not pass.
 */
export function deriveVoteStatus(input: {
    tally: VoteTally;
    type: VoteProposalType;
    options: readonly GovernanceProposalOption[];
    expired: boolean;
}): 'active' | 'passed' | 'failed' {
    const { tally, type, options, expired } = input;

    if (!expired) return 'active';
    if (!tally.quorumReached) return 'failed';
    if (tally.leadingOptionId === null) return 'failed';

    if (type === 'binary') {
        return tally.leadingOptionId === affirmativeOptionId(options) ? 'passed' : 'failed';
    }

    return 'passed';
}
