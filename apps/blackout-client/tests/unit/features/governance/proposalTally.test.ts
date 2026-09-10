import { describe, expect, it } from 'vitest';
import {
    affirmativeOptionId,
    deriveVoteStatus,
    tallyProposalVotes,
    type VoteProposalType,
} from '../../../../src/lib/bmc-core/proposalTally';

const BINARY = [
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' },
];

const CHOICES = [
    { id: 'a', label: 'Option A' },
    { id: 'b', label: 'Option B' },
    { id: 'c', label: 'Option C' },
];

const ballots = (...choices: Array<string | string[]>) => choices.map((choice) => ({ choice }));

const decide = (
    type: VoteProposalType,
    options: typeof BINARY,
    votes: Array<{ choice: string | string[] }>,
    quorum: number,
    expired = true
) => {
    const tally = tallyProposalVotes({ type, options, votes, quorum });
    return { tally, status: deriveVoteStatus({ tally, type, options, expired }) };
};

describe('the majority test', () => {
    it('fails a binary proposal that every voter voted against', () => {
        // The defect this locks out: status was `quorumReached ? 'passed' :
        // 'failed'`, so turning out to vote a proposal down passed it.
        const { tally, status } = decide('binary', BINARY, ballots('no', 'no', 'no'), 2);
        expect(tally.quorumReached).toBe(true);
        expect(tally.leadingOptionId).toBe('no');
        expect(status).toBe('failed');
    });

    it('passes a binary proposal the room actually voted for', () => {
        const { status } = decide('binary', BINARY, ballots('yes', 'yes', 'no'), 2);
        expect(status).toBe('passed');
    });

    it('fails a binary proposal that splits evenly', () => {
        const { tally, status } = decide('binary', BINARY, ballots('yes', 'no'), 2);
        expect(tally.tied).toBe(true);
        expect(tally.leadingOptionId).toBeNull();
        expect(status).toBe('failed');
    });

    it('reads the affirmative option by id, not by position', () => {
        // A proposer can reorder a binary proposal's options in the creator but
        // cannot change their ids.
        const reordered = [
            { id: 'no', label: 'No' },
            { id: 'yes', label: 'Yes' },
        ];
        expect(affirmativeOptionId(reordered)).toBe('yes');
        const { status } = decide('binary', reordered, ballots('yes', 'yes'), 1);
        expect(status).toBe('passed');
    });

    it('falls back to the first option when no option is called "yes"', () => {
        // Federated or older-schema ballots that never came from our creator.
        const foreign = [
            { id: 'approve', label: 'Approve' },
            { id: 'reject', label: 'Reject' },
        ];
        expect(affirmativeOptionId(foreign)).toBe('approve');
        expect(decide('binary', foreign, ballots('approve', 'approve'), 1).status).toBe('passed');
        expect(decide('binary', foreign, ballots('reject', 'reject'), 1).status).toBe('failed');
    });
});

describe('quorum', () => {
    it('fails a proposal that missed quorum however lopsided the vote', () => {
        const { tally, status } = decide('binary', BINARY, ballots('yes', 'yes'), 5);
        expect(tally.quorumReached).toBe(false);
        expect(status).toBe('failed');
    });

    it('stays active before the deadline whatever the tally says', () => {
        const { status } = decide('binary', BINARY, ballots('yes', 'yes'), 1, false);
        expect(status).toBe('active');
    });

    it('fails a proposal nobody voted on, even at quorum 0', () => {
        const { tally, status } = decide('multiple_choice', CHOICES, [], 0);
        expect(tally.quorumReached).toBe(true);
        expect(tally.leadingOptionId).toBeNull();
        expect(status).toBe('failed');
    });
});

describe('multiple choice', () => {
    it('passes when one option leads outright', () => {
        const { tally, status } = decide('multiple_choice', CHOICES, ballots('a', 'a', 'b'), 2);
        expect(tally.leadingOptionId).toBe('a');
        expect(status).toBe('passed');
    });

    it('fails a dead heat for first place — nothing was selected', () => {
        const { tally, status } = decide('multiple_choice', CHOICES, ballots('a', 'b'), 2);
        expect(tally.tied).toBe(true);
        expect(status).toBe('failed');
    });

    it('is not tied when the heat is for second place', () => {
        const { tally, status } = decide(
            'multiple_choice',
            CHOICES,
            ballots('a', 'a', 'b', 'c'),
            2
        );
        expect(tally.tied).toBe(false);
        expect(tally.leadingOptionId).toBe('a');
        expect(status).toBe('passed');
    });

    it('reports every option, highest first, including ones nobody picked', () => {
        const { tally } = decide('multiple_choice', CHOICES, ballots('b', 'b', 'a'), 1);
        expect(tally.optionResults).toEqual([
            { optionId: 'b', count: 2 },
            { optionId: 'a', count: 1 },
            { optionId: 'c', count: 0 },
        ]);
    });
});

describe('ranked scoring is Borda, not instant-runoff', () => {
    it('scores by position: first of n scores n, next n-1, and so on', () => {
        const { tally } = decide('ranked', CHOICES, ballots(['a', 'b', 'c']), 1);
        expect(tally.optionResults).toEqual([
            { optionId: 'a', count: 3 },
            { optionId: 'b', count: 2 },
            { optionId: 'c', count: 1 },
        ]);
    });

    it('can elect a broad second favourite over the plurality first choice', () => {
        // Why the method has to be named honestly. Four ballots:
        //   [a,b,c] -> a3 b2 c1
        //   [a,b,c] -> a3 b2 c1
        //   [b,c,a] -> b3 c2 a1
        //   [c,b,a] -> c3 b2 a1
        // Totals: a 8, b 9, c 7.
        //
        // 'a' is the first preference on half the ballots and no other option
        // is ranked first more often — under any plurality reading 'a' wins.
        // Borda elects 'b' instead, because 'b' is nobody's last choice. That
        // is the method working as designed, and it is exactly what a room
        // told it was using "ranked choice" would not expect.
        const { tally } = decide(
            'ranked',
            CHOICES,
            ballots(['a', 'b', 'c'], ['a', 'b', 'c'], ['b', 'c', 'a'], ['c', 'b', 'a']),
            1
        );
        expect(tally.optionResults).toEqual([
            { optionId: 'b', count: 9 },
            { optionId: 'a', count: 8 },
            { optionId: 'c', count: 7 },
        ]);
        expect(tally.leadingOptionId).toBe('b');
    });

    it('counts each ballot once toward turnout however many options it ranks', () => {
        const { tally } = decide('ranked', CHOICES, ballots(['a', 'b', 'c'], ['c', 'a']), 2);
        expect(tally.voteCount).toBe(2);
        expect(tally.quorumReached).toBe(true);
    });

    it('gives a multiple-choice ballot one point per option, not a ranking weight', () => {
        // The same array shape means approval, not preference, when the
        // proposal is not ranked.
        const { tally } = decide('multiple_choice', CHOICES, ballots(['a', 'b']), 1);
        expect(tally.optionResults).toEqual([
            { optionId: 'a', count: 1 },
            { optionId: 'b', count: 1 },
            { optionId: 'c', count: 0 },
        ]);
    });
});
