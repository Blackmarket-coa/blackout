import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

const KEY_V1 = randomBytes(32).toString('base64');

process.env.JWT_SECRET_PRIMARY = generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api';
process.env.JWT_AUDIENCE = 'blackout-clients';
process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS = `v1:${KEY_V1}`;
process.env.MATRIX_APPSERVICE_HS_TOKEN = 'test-hs-token-greeter';

const HS_TOKEN = process.env.MATRIX_APPSERVICE_HS_TOKEN!;

const loadRoute = async () => {
    const mod = await import('../src/routes/matrixAppservice');
    mod.__test__.resetSeenTxns();
    return mod;
};

interface JoinOpts {
    prevMembership?: string;
    membership?: string;
}

const memberTxn = (txnId: string, roomId: string, userId: string, opts: JoinOpts = {}): Request => {
    const event: Record<string, unknown> = {
        type: 'm.room.member',
        room_id: roomId,
        state_key: userId,
        sender: userId,
        content: { membership: opts.membership ?? 'join' },
    };
    if (opts.prevMembership) {
        event.unsigned = { prev_content: { membership: opts.prevMembership } };
    }
    return new Request(`http://x/transactions/${txnId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${HS_TOKEN}` },
        body: JSON.stringify({ events: [event] }),
    });
};

test('den greeter: first join greets once; replaying the join under a new txn id does not re-greet', async () => {
    process.env.BLACKOUT_DEN_GREETER = '1';
    try {
        const mod = await loadRoute();
        const greets: Array<{ roomId: string; userId: string }> = [];
        const router = mod.buildMatrixAppserviceRoute({
            hsTokenResolver: () => HS_TOKEN,
            greetRoom: (roomId, userId) => {
                greets.push({ roomId, userId });
            },
        });
        const roomId = '!den-greet-1:srv';
        const userId = '@joiner-1:srv';

        const first = await router.fetch(memberTxn('greet-1', roomId, userId));
        assert.equal(first.status, 200);
        assert.equal(greets.length, 1, 'a first join is greeted exactly once');
        assert.deepEqual(greets[0], { roomId, userId });

        // A NEW txn id bypasses the txn-idempotency cache, so only the durable
        // (roomId,userId) dedupe stops the second greeting.
        const second = await router.fetch(memberTxn('greet-2', roomId, userId));
        assert.equal(second.status, 200);
        assert.equal(greets.length, 1, 'the (roomId,userId) ledger prevents a re-greet');
    } finally {
        delete process.env.BLACKOUT_DEN_GREETER;
    }
});

test('den greeter: with the flag off, a first join is not greeted', async () => {
    delete process.env.BLACKOUT_DEN_GREETER;
    const mod = await loadRoute();
    const greets: Array<{ roomId: string; userId: string }> = [];
    const router = mod.buildMatrixAppserviceRoute({
        hsTokenResolver: () => HS_TOKEN,
        greetRoom: (roomId, userId) => {
            greets.push({ roomId, userId });
        },
    });
    const res = await router.fetch(memberTxn('greet-off-1', '!den-off:srv', '@joiner-off:srv'));
    assert.equal(res.status, 200);
    assert.equal(greets.length, 0, 'the greeter stays dark unless BLACKOUT_DEN_GREETER=1');
});

test('den greeter: a membership event that was already a join (profile change) is not a first join', async () => {
    process.env.BLACKOUT_DEN_GREETER = '1';
    try {
        const mod = await loadRoute();
        const greets: Array<{ roomId: string; userId: string }> = [];
        const router = mod.buildMatrixAppserviceRoute({
            hsTokenResolver: () => HS_TOKEN,
            greetRoom: (roomId, userId) => {
                greets.push({ roomId, userId });
            },
        });
        const res = await router.fetch(
            memberTxn('greet-prof-1', '!den-prof:srv', '@joiner-prof:srv', {
                prevMembership: 'join',
            })
        );
        assert.equal(res.status, 200);
        assert.equal(greets.length, 0, 'an avatar/display-name change is not a join');
    } finally {
        delete process.env.BLACKOUT_DEN_GREETER;
    }
});

test('den greeter: a non-join membership (invite) is not greeted', async () => {
    process.env.BLACKOUT_DEN_GREETER = '1';
    try {
        const mod = await loadRoute();
        const greets: Array<{ roomId: string; userId: string }> = [];
        const router = mod.buildMatrixAppserviceRoute({
            hsTokenResolver: () => HS_TOKEN,
            greetRoom: (roomId, userId) => {
                greets.push({ roomId, userId });
            },
        });
        const res = await router.fetch(
            memberTxn('greet-inv-1', '!den-inv:srv', '@invitee:srv', { membership: 'invite' })
        );
        assert.equal(res.status, 200);
        assert.equal(greets.length, 0);
    } finally {
        delete process.env.BLACKOUT_DEN_GREETER;
    }
});
