// The write-behind queue's lanes, on the queue itself with a recording pool.
//
// A scoped call (`enqueueCall` with a map and a row's key: the dead-man
// switch's conditional statements) is ordered only against the queued writes
// that can touch its row. Since the store's whole-table resync was replaced by
// targeted ops (docs/security/store-cross-process-writes-2026-10-31.md), the
// write that can touch any row of a table is a targeted op naming it, whose
// statements find rows by key or by a predicate Postgres evaluates; these
// tests pin how the two are ordered (round 20 of the dead-man release
// review, part 2, docs/security/release-envelope-2026-10-26.md).
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = 'memory';

const { WriteBehindQueue } = await import('../src/db/writeBehindQueue');

type Statement = { sql: string; params: unknown[] };

const gate = () => {
    let open!: () => void;
    const promise = new Promise<void>((resolve) => {
        open = resolve;
    });
    return { promise, open };
};

/** A pool that records every statement, and holds the ones `hold` gives a gate for. */
const recordingPool = (hold: (sql: string) => Promise<void> | null = () => null) => {
    const ran: string[] = [];
    const pool = {
        connect: async () => ({
            async query(sql: string, _params?: unknown[]) {
                const wait = hold(sql);
                if (wait) await wait;
                ran.push(sql);
                return { rows: [] };
            },
            release: () => {},
        }),
        end: async () => {},
    };
    return { pool, ran };
};

const planFor = (mapName: string) => ({
    descriptor: {
        mapName,
        tableName: mapName,
        keyOf: (r: Record<string, unknown>) => String(r.id),
        conflictColumns: ['id'],
    },
    columns: [{ name: 'id', dataType: 'text', udtName: 'text' }],
    columnNames: new Set(['id']),
});
const plans = new Map([
    ['switches', planFor('switches')],
    ['others', planFor('others')],
]);

/** One targeted write of one statement on `map`, touching no key of the mirror. */
const targetedOn = (map: string, sql: string) => ({
    method: 'test',
    statements: [{ map, sql, params: ['x'], required: false }] as Array<
        Statement & { map: string; required: boolean }
    >,
    touched: new Map<string, Map<string, unknown[]>>(),
});

const soon = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const statementsOnly = (ran: string[]) =>
    ran.filter((sql) => sql !== 'BEGIN' && sql !== 'COMMIT' && sql !== 'ROLLBACK');

test('a scoped call does not wait for a targeted op on another table held ahead of it, nor for an upsert of another row of its own', async () => {
    const held = gate();
    const { pool, ran } = recordingPool((sql) => (sql === 'DELETE others' ? held.promise : null));
    const queue = new WriteBehindQueue(pool as never, plans as never);
    queue.enqueueTargeted(targetedOn('others', 'DELETE others') as never);
    queue.enqueueUpsert('switches', { id: 'b' }); // behind the held op, on the FIFO chain
    const call = queue.enqueueCall(
        async (client) => {
            await client.query('UPDATE switches a', []);
            return 'answered';
        },
        { mapName: 'switches', key: 'a' }
    );
    // A bounded wait, so a call that does wait fails this test and does not hang it.
    const answered = await Promise.race([call, soon(500).then(() => 'still waiting')]);
    assert.equal(answered, 'answered', 'not behind the held write to another table');
    assert.deepEqual(statementsOnly(ran), ['UPDATE switches a']);
    held.open();
    await queue.drain();
    assert.equal(statementsOnly(ran).length, 3, 'the held op and the upsert behind it then ran');
});

test('a scoped call queued after a targeted op that names its table waits for that op: the op’s predicate can reach its row', async () => {
    const held = gate();
    const { pool, ran } = recordingPool((sql) => (sql === 'DELETE switches' ? held.promise : null));
    const queue = new WriteBehindQueue(pool as never, plans as never);
    queue.enqueueTargeted(targetedOn('switches', 'DELETE switches') as never);
    let answered = false;
    const call = queue
        .enqueueCall(
            async (client) => {
                await client.query('UPDATE switches a', []);
            },
            { mapName: 'switches', key: 'a' }
        )
        .then(() => {
            answered = true;
        });
    await soon();
    assert.equal(answered, false, 'the call waits while the op on its table is out');
    assert.deepEqual(statementsOnly(ran), []);
    held.open();
    await call;
    assert.deepEqual(statementsOnly(ran), ['DELETE switches', 'UPDATE switches a'], 'in order');
    await queue.drain();
});

test('a targeted op that names a table waits for a scoped call in flight on a row of it, and so does everything queued after that op', async () => {
    const held = gate();
    const { pool, ran } = recordingPool((sql) =>
        sql === 'UPDATE switches a' ? held.promise : null
    );
    const queue = new WriteBehindQueue(pool as never, plans as never);
    const call = queue.enqueueCall(
        async (client) => {
            await client.query('UPDATE switches a', []);
        },
        { mapName: 'switches', key: 'a' }
    );
    queue.enqueueTargeted(targetedOn('switches', 'DELETE switches') as never);
    queue.enqueueUpsert('others', { id: 'z' });
    await soon();
    assert.deepEqual(statementsOnly(ran), [], 'neither ran while the call is out');
    held.open();
    await call;
    await queue.drain();
    const order = statementsOnly(ran);
    assert.equal(order[0], 'UPDATE switches a');
    assert.equal(order[1], 'DELETE switches', 'the op after the call it could have crossed');
    assert.equal(order.length, 3, 'and the write queued behind the op after it');
});

test('an upsert of a row waits for a scoped call in flight on that row and not for one on another row; drain waits for the calls', async () => {
    const heldA = gate();
    const { pool, ran } = recordingPool((sql) =>
        sql === 'UPDATE switches a' ? heldA.promise : null
    );
    const queue = new WriteBehindQueue(pool as never, plans as never);
    const callA = queue.enqueueCall(
        async (client) => {
            await client.query('UPDATE switches a', []);
        },
        { mapName: 'switches', key: 'a' }
    );
    // Another row's upsert first, so the FIFO chain is not what holds it.
    queue.enqueueUpsert('switches', { id: 'b' });
    await soon();
    assert.equal(statementsOnly(ran).length, 1, 'the other row’s upsert ran past the held call');
    queue.enqueueUpsert('switches', { id: 'a' });
    await soon();
    assert.equal(statementsOnly(ran).length, 1, 'the upsert of the call’s row waits for it');
    let drained = false;
    const draining = queue.drain().then(() => {
        drained = true;
    });
    await soon();
    assert.equal(drained, false, 'drain waits for the scoped call');
    heldA.open();
    await callA;
    await draining;
    const order = statementsOnly(ran);
    assert.equal(order[1], 'UPDATE switches a');
    assert.equal(order.length, 3, 'then the upsert of its row');
    assert.equal(queue.isFenced('switches', 'a'), false, 'and its fence came down');
});

test('drain waits for a scoped call with nothing queued behind it', async () => {
    const held = gate();
    const { pool, ran } = recordingPool((sql) =>
        sql === 'UPDATE switches a' ? held.promise : null
    );
    const queue = new WriteBehindQueue(pool as never, plans as never);
    const call = queue.enqueueCall(
        async (client) => {
            await client.query('UPDATE switches a', []);
        },
        { mapName: 'switches', key: 'a' }
    );
    let drained = false;
    const draining = queue.drain().then(() => {
        drained = true;
    });
    await soon();
    assert.equal(drained, false, 'the call is out, and no queued write stands behind it');
    held.open();
    await call;
    await draining;
    assert.deepEqual(statementsOnly(ran), ['UPDATE switches a']);
});
