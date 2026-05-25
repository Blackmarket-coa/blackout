import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Runs in its own process (node --test isolates files), so pointing the store
// at a temp JSON file here does not affect other suites. Proves the Coliseum
// collections survive a store reload — the whole point of moving them off the
// ephemeral in-memory maps.
const tmpDir = mkdtempSync(join(tmpdir(), 'coliseum-persist-'));
process.env.BLACKOUT_DB_MODE = 'file';
process.env.BLACKOUT_DB_FILE = join(tmpDir, 'store.json');
// Production mode: the demo-user seeding (which persists during construction and
// would clobber an existing file before hydrate) is skipped, matching how a real
// deployment reloads its persisted store on restart.
process.env.NODE_ENV = 'production';
delete process.env.BLACKOUT_DEMO_PASSWORD;

const { db, FileBackedDb } = await import('../src/db/store');

test.after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
});

test('coliseum records persist across a store reload', () => {
    db.upsertColiseumTopic({
        id: 'persist-topic',
        title: 'Does the store survive a restart?',
        newsAnchor: {
            sourceUrl: 'https://news.example/persist',
            headline: 'Durability under test',
            publishedAt: '2026-05-02T08:00:00Z',
        },
        createdAt: '2026-05-02T09:00:00Z',
        tags: ['infra'],
        category: 'tech',
        status: 'active',
        recencyScore: 0.5,
        velocityScore: 0.2,
        debateHeat: 0.4,
    });
    db.upsertColiseumArgument({
        id: 'persist-arg',
        topicId: 'persist-topic',
        authorId: '@author:server',
        stance: 'for',
        stanceWeight: 0.8,
        body: 'Records should reload from disk.',
        citations: [],
        createdAt: '2026-05-02T10:00:00Z',
        voteScore: 0.3,
        nuanceScore: 0.1,
    });
    db.upsertColiseumVote({
        argumentId: 'persist-arg',
        voterId: '@voter:server',
        direction: 'up',
        createdAt: '2026-05-02T10:05:00Z',
    });
    db.upsertColiseumLiveSession({
        id: 'persist-session',
        topicId: 'persist-topic',
        roomId: '!persist-debate:server',
        moderatorIds: ['@author:server'],
        status: 'live',
        speakingQueue: [
            { userId: '@voter:server', state: 'requested', requestedAt: '2026-05-02T10:06:00Z' },
        ],
        pinnedEvidence: [{ kind: 'argument', argumentId: 'persist-arg' }],
        createdAt: '2026-05-02T10:06:00Z',
        startedAt: '2026-05-02T10:06:00Z',
    });

    // A fresh instance hydrates from the same file — the restart simulation.
    const reloaded = new FileBackedDb();

    const topic = reloaded.getColiseumTopic('persist-topic');
    assert.equal(topic?.title, 'Does the store survive a restart?');

    const argument = reloaded.getColiseumArgument('persist-arg');
    assert.equal(argument?.body, 'Records should reload from disk.');

    const vote = reloaded.getColiseumVote('persist-arg', '@voter:server');
    assert.equal(vote?.direction, 'up');

    const session = reloaded.getColiseumLiveSession('persist-session');
    assert.equal(session?.roomId, '!persist-debate:server');
    assert.equal(session?.speakingQueue[0]?.userId, '@voter:server');
    assert.equal(session?.pinnedEvidence[0]?.kind, 'argument');
});
