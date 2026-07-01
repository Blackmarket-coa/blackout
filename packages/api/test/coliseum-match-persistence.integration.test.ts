import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Own process (node --test isolates files). Proves the new Coliseum match
// collections (matches, rounds, round votes, shouts, drops, drop votes, briefs,
// crucible statements/votes) survive a store reload in file mode.
const tmpDir = mkdtempSync(join(tmpdir(), 'coliseum-match-persist-'));
process.env.BLACKOUT_DB_MODE = 'file';
process.env.BLACKOUT_DB_FILE = join(tmpDir, 'store.json');
process.env.NODE_ENV = 'production';
delete process.env.BLACKOUT_DEMO_PASSWORD;

const { db, FileBackedDb } = await import('../src/db/store');

test.after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
});

test('coliseum match records persist across a store reload', () => {
    db.upsertColiseumMatch({
        id: 'persist-match',
        type: 'callout',
        proposition: 'Persistence works',
        domain: 'tech',
        challengerId: '@red:server',
        opponentId: '@blue:server',
        status: 'verdict',
        createdAt: '2026-05-02T09:00:00Z',
        acceptedAt: '2026-05-02T09:05:00Z',
        verdictAt: '2026-05-02T10:00:00Z',
        roundWindowMs: 86400000,
        challengeToken: 'tok123',
        open: false,
        positionStart: { agreeShare: 0.8, certainty: 0.6, sampleSize: 5 },
    });
    db.upsertColiseumPositionVote({
        matchId: 'persist-match',
        voterId: '@spec:server',
        agree: true,
        certain: false,
        createdAt: '2026-05-02T09:20:00Z',
    });
    db.upsertColiseumRound({
        id: 'persist-round',
        matchId: 'persist-match',
        index: 0,
        side: 'red',
        authorId: '@red:server',
        kind: 'opening',
        body: 'Opening',
        citations: [],
        createdAt: '2026-05-02T09:10:00Z',
    });
    db.upsertColiseumRoundVote({
        matchId: 'persist-match',
        roundIndex: 0,
        voterId: '@spec:server',
        choice: 'red',
        createdAt: '2026-05-02T09:11:00Z',
    });
    db.upsertColiseumShout({
        id: 'persist-shout',
        authorId: '@red:server',
        domain: 'finance',
        media: { kind: 'video', mxc: 'mxc://server/shout1' },
        createdAt: '2026-05-02T08:00:00Z',
        heat: 0.5,
    });
    db.upsertColiseumResponseDrop({
        id: 'persist-drop',
        shoutId: 'persist-shout',
        authorId: '@blue:server',
        media: { kind: 'video', mxc: 'mxc://server/drop1' },
        createdAt: '2026-05-02T08:05:00Z',
        voteScore: 0.4,
    });
    db.upsertColiseumResponseDropVote({
        dropId: 'persist-drop',
        voterId: '@spec:server',
        direction: 'up',
        createdAt: '2026-05-02T08:06:00Z',
    });
    db.upsertColiseumBrief({
        id: 'persist-brief',
        matchId: 'persist-match',
        proposition: 'Persistence works',
        claims: [],
        upheldFlags: [],
        shiftScore: 0.3,
        winner: 'red',
        questionBreakdown: [],
        mintedAt: '2026-05-02T10:00:00Z',
    });
    db.upsertColiseumCrucibleStatement({
        matchId: 'persist-match',
        side: 'red',
        authorId: '@red:server',
        body: 'Closing',
        createdAt: '2026-05-02T09:50:00Z',
    });
    db.upsertColiseumCrucibleVote({
        matchId: 'persist-match',
        questionId: 'decisive',
        voterId: '@spec:server',
        choice: 'red',
        createdAt: '2026-05-02T09:55:00Z',
    });

    const reloaded = new FileBackedDb();

    assert.equal(reloaded.getColiseumMatch('persist-match')?.proposition, 'Persistence works');
    assert.equal(reloaded.getColiseumMatch('persist-match')?.challengeToken, 'tok123');
    assert.equal(reloaded.getColiseumRound('persist-round')?.kind, 'opening');
    assert.equal(reloaded.listColiseumRoundVotes().length, 1);
    assert.equal(reloaded.getColiseumShout('persist-shout')?.heat, 0.5);
    assert.equal(reloaded.getColiseumResponseDrop('persist-drop')?.voteScore, 0.4);
    assert.equal(reloaded.listColiseumResponseDropVotes()[0]?.direction, 'up');
    assert.equal(reloaded.getColiseumBrief('persist-brief')?.winner, 'red');
    assert.equal(reloaded.listColiseumCrucibleStatements()[0]?.body, 'Closing');
    assert.equal(reloaded.listColiseumCrucibleVotes()[0]?.choice, 'red');
    assert.equal(reloaded.getColiseumMatch('persist-match')?.positionStart?.sampleSize, 5);
    assert.equal(reloaded.listColiseumPositionVotes()[0]?.agree, true);
});
