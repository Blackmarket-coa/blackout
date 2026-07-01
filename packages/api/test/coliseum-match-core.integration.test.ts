import test from 'node:test';
import assert from 'node:assert/strict';

import {
    COOLDOWN_MS,
    CRUCIBLE_QUESTIONS,
    aggregatePosition,
    computeShiftScore,
    cooldownRemainingMs,
    deriveChallengeStatus,
    deriveColiseumMatchStatus,
    deriveCrucibleVerdict,
    detectBilateralExchange,
    isForfeit,
    isUnderCooldown,
    isWithinRoundDurationCap,
    mintBrief,
    rankResponseDrops,
    tallyRoundVotes,
    type ColiseumPositionVote,
    type ColiseumResponseDrop,
    type ColiseumRoundVote,
    type ColiseumShout,
    type CrucibleSynthesisVote,
} from '@blackout/core';

const T0 = Date.parse('2026-01-01T00:00:00Z');

test('deriveColiseumMatchStatus walks the lifecycle', () => {
    assert.equal(
        deriveColiseumMatchStatus({ createdAt: new Date(T0).toISOString() }, T0),
        'pending'
    );
    assert.equal(
        deriveColiseumMatchStatus(
            { createdAt: new Date(T0).toISOString(), acceptedAt: new Date(T0).toISOString() },
            T0 + 1000
        ),
        'live'
    );
    assert.equal(
        deriveColiseumMatchStatus(
            {
                createdAt: new Date(T0).toISOString(),
                acceptedAt: new Date(T0).toISOString(),
                clockEndsAt: new Date(T0 + 1000).toISOString(),
            },
            T0 + 2000
        ),
        'crucible'
    );
    assert.equal(
        deriveColiseumMatchStatus(
            { createdAt: new Date(T0).toISOString(), verdictAt: new Date(T0 + 5000).toISOString() },
            T0 + 6000
        ),
        'verdict'
    );
});

test('tallyRoundVotes picks the leader and hides nothing extra', () => {
    const votes: ColiseumRoundVote[] = [
        { matchId: 'm', roundIndex: 0, voterId: 'a', choice: 'red', createdAt: '' },
        { matchId: 'm', roundIndex: 0, voterId: 'b', choice: 'red', createdAt: '' },
        { matchId: 'm', roundIndex: 0, voterId: 'c', choice: 'blue', createdAt: '' },
    ];
    const tally = tallyRoundVotes(votes);
    assert.deepEqual(
        { red: tally.red, blue: tally.blue, draw: tally.draw },
        { red: 2, blue: 1, draw: 0 }
    );
    assert.equal(tally.leader, 'red');
    assert.equal(tallyRoundVotes([]).leader, 'draw');
});

test('isForfeit triggers only past the window; duration cap enforced', () => {
    const last = new Date(T0).toISOString();
    assert.equal(isForfeit(last, 1000, T0 + 500), false);
    assert.equal(isForfeit(last, 1000, T0 + 2000), true);
    assert.equal(isWithinRoundDurationCap(undefined), true);
    assert.equal(
        isWithinRoundDurationCap({ kind: 'video', mxc: 'mxc://s/x', durationMs: 179000 }),
        true
    );
    assert.equal(
        isWithinRoundDurationCap({ kind: 'video', mxc: 'mxc://s/x', durationMs: 181000 }),
        false
    );
});

test('deriveCrucibleVerdict tallies per question and picks the overall winner', () => {
    const votes: CrucibleSynthesisVote[] = [];
    for (const q of CRUCIBLE_QUESTIONS) {
        for (let i = 0; i < 3; i += 1) {
            votes.push({
                matchId: 'm',
                questionId: q.id,
                voterId: `r${i}-${q.id}`,
                choice: 'red',
                createdAt: '',
            });
        }
    }
    const verdict = deriveCrucibleVerdict({ matchId: 'm', synthesisVotes: votes, nowMs: T0 });
    assert.equal(verdict.winner, 'red');
    assert.equal(verdict.redScore, CRUCIBLE_QUESTIONS.length);
    assert.equal(verdict.breakdown.length, CRUCIBLE_QUESTIONS.length);

    const tie = deriveCrucibleVerdict({ matchId: 'm', synthesisVotes: [], nowMs: T0 });
    assert.equal(tie.winner, null);
});

test('computeShiftScore measures crowd movement; mintBrief is immutable assembly', () => {
    const verdict = deriveCrucibleVerdict({ matchId: 'm', synthesisVotes: [], nowMs: T0 });
    const shift = computeShiftScore(
        { agreeShare: 0.2, certainty: 0.4, sampleSize: 10 },
        { agreeShare: 0.7, certainty: 0.6, sampleSize: 10 }
    );
    assert.ok(shift > 0 && shift <= 1);
    const brief = mintBrief({
        id: 'b1',
        matchId: 'm',
        proposition: 'P',
        verdict,
        positionStart: { agreeShare: 0.2, certainty: 0.4, sampleSize: 10 },
        positionEnd: { agreeShare: 0.7, certainty: 0.6, sampleSize: 10 },
        mintedAt: new Date(T0).toISOString(),
    });
    assert.equal(brief.proposition, 'P');
    assert.ok(brief.shiftScore > 0);
});

test('aggregatePosition folds placements into agree/certainty shares', () => {
    const votes: ColiseumPositionVote[] = [
        { matchId: 'm', voterId: 'a', agree: true, certain: true, createdAt: '' },
        { matchId: 'm', voterId: 'b', agree: true, certain: false, createdAt: '' },
        { matchId: 'm', voterId: 'c', agree: false, certain: false, createdAt: '' },
        { matchId: 'm', voterId: 'd', agree: false, certain: true, createdAt: '' },
    ];
    assert.deepEqual(aggregatePosition(votes), { agreeShare: 0.5, certainty: 0.5, sampleSize: 4 });
    assert.deepEqual(aggregatePosition([]), { agreeShare: 0, certainty: 0, sampleSize: 0 });
});

test('cooldown blocks within 48h and clears after', () => {
    const ended = new Date(T0).toISOString();
    assert.equal(isUnderCooldown(ended, T0 + 1000), true);
    assert.equal(isUnderCooldown(ended, T0 + COOLDOWN_MS + 1), false);
    assert.equal(isUnderCooldown(undefined, T0), false);
    assert.ok(cooldownRemainingMs(ended, T0 + 1000) > 0);
});

test('deriveChallengeStatus prioritizes accept > decline > open > seen > pending', () => {
    assert.equal(deriveChallengeStatus({ accepted: true, seenAt: 'x' }), 'accepted');
    assert.equal(deriveChallengeStatus({ accepted: false, declinedAt: 'x' }), 'declined');
    assert.equal(deriveChallengeStatus({ accepted: false, open: true }), 'open');
    assert.equal(deriveChallengeStatus({ accepted: false, seenAt: 'x' }), 'seen');
    assert.equal(deriveChallengeStatus({ accepted: false }), 'pending');
});

test('rankResponseDrops sorts by score; detectBilateralExchange spots the back-and-forth', () => {
    const drops: ColiseumResponseDrop[] = [
        {
            id: 'd1',
            shoutId: 's',
            authorId: 'other',
            media: { kind: 'video', mxc: 'mxc://s/x' },
            createdAt: '2026-01-01T00:01:00Z',
            voteScore: 0.2,
        },
        {
            id: 'd2',
            shoutId: 's',
            authorId: 'shouter',
            media: { kind: 'video', mxc: 'mxc://s/y' },
            createdAt: '2026-01-01T00:02:00Z',
            voteScore: 0.8,
        },
    ];
    const ranked = rankResponseDrops(drops);
    assert.equal(ranked[0]!.id, 'd2');
    assert.equal(ranked[0]!.rank, 1);

    const shout: ColiseumShout = {
        id: 's',
        authorId: 'shouter',
        media: { kind: 'video', mxc: 'mxc://s/z' },
        createdAt: '2026-01-01T00:00:00Z',
        heat: 0,
    };
    const exchange = detectBilateralExchange(shout, drops);
    assert.ok(exchange);
    assert.equal(exchange!.shouterId, 'shouter');
    assert.equal(exchange!.responderId, 'other');

    // Without the shouter replying, no bilateral exchange.
    assert.equal(detectBilateralExchange(shout, [drops[0]!]), null);
});
