// The targeted-statement primitives in pgWriter (compileStep, bindStep,
// keyOfTuple, kvOf, selectByKeys, guardExpr, prepareCheck), checked against
// every table the store maps, with every migration applied to an in-process
// PGlite. They replace resyncMap, which reconciled a whole table against one
// process's mirror and so deleted rows that process had not heard of.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

process.env.BLACKOUT_DB_MODE = 'memory';

const { MIGRATIONS_DIR } = await import('../src/db/migrate');
const { TABLE_DESCRIPTORS, MUTATOR_SPECS } = await import('../src/db/pgDescriptors');
const W = await import('../src/db/pgWriter');
const { PGlite } = await import('@electric-sql/pglite');

type TablePlan = import('../src/db/pgWriter').TablePlan;
type TargetedStep = import('../src/db/pgWriter').TargetedStep;
type StepContext = import('../src/db/pgWriter').StepContext;
type Pg = {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
    exec: (sql: string) => Promise<unknown>;
};

async function schema(): Promise<{ pg: Pg; client: never; plans: TablePlan[] }> {
    const pg = new PGlite() as unknown as Pg;
    const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
        .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
    for (const f of files) await pg.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
    const client = { query: (sql: string, params?: unknown[]) => pg.query(sql, params) } as never;
    const plans: TablePlan[] = [];
    for (const descriptor of TABLE_DESCRIPTORS) {
        const columns = await W.introspectColumns(client, descriptor.tableName);
        plans.push({ descriptor, columns, columnNames: new Set(columns.map((c) => c.name)) });
    }
    return { pg, client, plans };
}

const shared = schema();

const ctx = (over: Partial<StepContext> = {}): StepContext => ({
    args: [],
    result: undefined,
    before: () => undefined,
    changed: () => [],
    at: new Date().toISOString(),
    ...over,
});

/** A record holding only its key fields, valued by column type; text values carry ':' and '::'. */
function sampleRecord(plan: TablePlan): Record<string, unknown> {
    const rec: Record<string, unknown> = {};
    for (const c of plan.descriptor.conflictColumns) {
        const meta = plan.columns.find((m) => m.name === c)!;
        let v: unknown;
        if (meta.udtName === 'uuid') v = randomUUID();
        else if (/^int|^numeric|^float/.test(meta.udtName)) v = 7;
        else if (meta.udtName === 'date') v = '2026-10-31';
        else if (meta.udtName.startsWith('timestamp')) v = '2026-10-31T01:02:03.456Z';
        else v = `v:${c}::${randomUUID().slice(0, 8)}`;
        rec[W.snakeToCamel(c)] = v;
    }
    return rec;
}

/**
 * An UPDATE or DELETE whose restricting clause (from USING or WHERE up to
 * RETURNING) uses a parameter, and which has a WHERE. deleteKeys restricts
 * through `USING unnest($n...)`, the other forms through WHERE itself.
 */
function restrictsByParameter(sql: string): boolean {
    const m = /^(?:UPDATE|DELETE)\b[\s\S]*?\b(?:USING|WHERE)\b([\s\S]*?)\bRETURNING\b/.exec(sql);
    return m !== null && /\bWHERE\b/.test(sql) && /\$[1-9]/.test(m[1]);
}

test('U2: keyOfTuple(kvOf(record)) is the mirror key keyOf(record), for every descriptor', async () => {
    const { plans } = await shared;
    assert.equal(plans.length, TABLE_DESCRIPTORS.length);
    for (const plan of plans) {
        const rec = sampleRecord(plan);
        const kv = W.kvOf(plan, rec);
        assert.equal(kv.length, plan.descriptor.conflictColumns.length, plan.descriptor.mapName);
        assert.equal(
            W.keyOfTuple(plan, kv),
            plan.descriptor.keyOf(rec),
            `${plan.descriptor.mapName}: key built from its key columns`
        );
    }
    // The two separators that differ: develop's resyncMap joined every
    // composite key with ':' and so never matched a circleEdges key.
    const circle = plans.find((p) => p.descriptor.mapName === 'circleEdges')!;
    const linked = plans.find((p) => p.descriptor.mapName === 'linkedAccounts')!;
    assert.equal(W.keyOfTuple(circle, ['a', 'b']), 'a::b');
    assert.equal(W.keyOfTuple(linked, ['u', 'twitch']), 'u:twitch');
    // A nullable key column left unset keys like the record that omits it.
    const attribution = plans.find((p) => p.descriptor.mapName === 'coalitionCampaignAttribution')!;
    const partial = { campaignId: 'c', channel: 'x' };
    assert.equal(
        W.keyOfTuple(attribution, W.kvOf(attribution, partial)),
        attribution.descriptor.keyOf(partial)
    );
});

test('U3: every compiled UPDATE and DELETE has a WHERE that uses a parameter, and every step PREPAREs on every table', async () => {
    const { client, plans } = await shared;
    let prepared = 0;
    for (const plan of plans) {
        const keys = plan.descriptor.conflictColumns;
        const map = plan.descriptor.mapName;
        const nonKey = plan.columns.filter((c) => !keys.includes(c.name));
        const steps: TargetedStep[] = [
            { op: 'deleteKey', map, key: () => [] },
            { op: 'deleteKeys', map, keys: () => [] },
            { op: 'deleteWhere', map, where: `${keys[0]} = $1`, params: () => [] },
            { op: 'upsertEach', map, records: () => [] },
        ];
        if (nonKey.length > 0) {
            steps.push({
                op: 'updateWhere',
                map,
                set: `${nonKey[0].name} = ${nonKey[0].name}`,
                where: `${keys[0]} = $1`,
                params: () => [],
            });
        }
        // One guard per column type class the table has (timestamp, JSON, other).
        const classes = new Map<string, string>();
        for (const c of nonKey) {
            const k = c.dataType.startsWith('timestamp')
                ? 'ts'
                : c.dataType.startsWith('json')
                ? 'json'
                : c.udtName.startsWith('_')
                ? 'array'
                : 'other';
            if (!classes.has(k)) classes.set(k, c.name);
        }
        for (const column of classes.values()) {
            steps.push({
                op: 'deleteKey',
                map,
                key: () => [],
                guard: { column, value: () => null },
            });
            steps.push({
                op: 'deleteKey',
                map,
                key: () => [],
                guard: { column, value: () => null, nullMatchesAny: true },
            });
            steps.push({ op: 'deleteKeys', map, keys: () => [], guard: { column } });
            steps.push({
                op: 'deleteKeys',
                map,
                keys: () => [],
                guard: { column, nullMatchesAny: true },
            });
        }
        for (const step of steps) {
            const compiled = W.compileStep(plan, step);
            if (step.op !== 'upsertEach') {
                assert.ok(restrictsByParameter(compiled.checkSql), compiled.checkSql);
            }
            assert.match(
                compiled.checkSql,
                new RegExp(`RETURNING (x\\.)?${keys[0]}\\b`),
                compiled.checkSql
            );
            await W.prepareCheck(client, compiled.checkSql);
            prepared += 1;
        }
        await W.prepareCheck(client, W.selectByKeysSql(plan));
        prepared += 1;
    }
    assert.ok(prepared > plans.length * 5, `prepared ${prepared} statements`);

    // The check itself: a SET that alone uses the parameter does not restrict.
    assert.equal(restrictsByParameter('UPDATE t SET a = $1 WHERE id = id RETURNING id'), false);
    assert.equal(restrictsByParameter('DELETE FROM t RETURNING id'), false);

    // The compiler refuses what PREPARE would accept but must never run.
    const users = plans.find((p) => p.descriptor.mapName === 'users')!;
    const bad: Array<[string, TargetedStep]> = [
        ['no parameter', { op: 'deleteWhere', map: 'users', where: 'TRUE', params: () => [] }],
        [
            'no parameter',
            {
                op: 'updateWhere',
                map: 'users',
                set: 'email = email',
                where: 'id = id',
                params: () => [],
            },
        ],
        [
            'separator',
            {
                op: 'deleteWhere',
                map: 'users',
                where: 'id = $1; DELETE FROM users',
                params: () => [],
            },
        ],
        [
            'separator',
            {
                op: 'updateWhere',
                map: 'users',
                set: 'email = $2; SELECT 1',
                where: 'id = $1',
                params: () => [],
            },
        ],
        [
            'missing column',
            {
                op: 'deleteKey',
                map: 'users',
                key: () => [],
                guard: { column: 'nope', value: () => 1 },
            },
        ],
        [
            'missing column',
            { op: 'upsertEach', map: 'users', records: () => [], onConflictSet: { nope: '1' } },
        ],
    ];
    for (const [why, step] of bad) {
        assert.throws(() => W.compileStep(users, step), Error, `${why}: ${JSON.stringify(step)}`);
    }
    // A step naming a column only inside its literal compiles, and the boot check refuses it.
    const typo = W.compileStep(users, {
        op: 'updateWhere',
        map: 'users',
        set: 'emial = $2',
        where: 'id = $1',
        params: () => [],
    });
    await assert.rejects(W.prepareCheck(client, typo.checkSql), /emial/);
});

test('U3 (specs): every targeted spec compiles to statements that restrict by a parameter and PREPARE on the schema', async () => {
    const { client, plans } = await shared;
    const byMap = new Map(plans.map((p) => [p.descriptor.mapName, p]));
    let steps = 0;
    for (const [method, spec] of Object.entries(MUTATOR_SPECS)) {
        if (spec.kind !== 'targeted') continue;
        assert.ok(spec.steps.length > 0, method);
        for (const step of spec.steps) {
            const plan = byMap.get(step.map);
            assert.ok(plan, `${method}: no table for ${step.map}`);
            const compiled = W.compileStep(plan, step);
            if (step.op !== 'upsertEach') {
                assert.ok(
                    restrictsByParameter(compiled.checkSql),
                    `${method}: ${compiled.checkSql}`
                );
            }
            await W.prepareCheck(client, compiled.checkSql);
            steps += 1;
        }
    }
    assert.ok(steps >= 19, `${steps} targeted steps`);
});

test('U3 (binding): parameters line up with placeholders, and a step that does not apply binds nothing', async () => {
    const { plans } = await shared;
    const circle = plans.find((p) => p.descriptor.mapName === 'circleEdges')!;
    const spatial = plans.find((p) => p.descriptor.mapName === 'coalitionSpatialItems')!;
    const placeholders = (sql: string) =>
        Math.max(0, ...[...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));

    const one = W.compileStep(circle, {
        op: 'deleteKey',
        map: 'circleEdges',
        key: (c) => c.args as unknown[],
    });
    const b1 = W.bindStep(one, ctx({ args: ['f', 'g'] }));
    assert.equal(b1.length, 1);
    assert.deepEqual(b1[0].params, ['f', 'g']);
    assert.equal(placeholders(b1[0].sql), 2);
    assert.deepEqual(
        W.bindStep(
            W.compileStep(circle, { op: 'deleteKey', map: 'circleEdges', key: () => undefined }),
            ctx()
        ),
        []
    );
    assert.throws(
        () => W.bindStep(one, ctx({ args: ['only-one'] })),
        /1 key values for 2 key columns/
    );

    const guarded = W.compileStep(spatial, {
        op: 'deleteKeys',
        map: 'coalitionSpatialItems',
        keys: () => [{ kv: ['a'], guard: '2026-10-31T00:00:00.000Z' }, { kv: ['b'] }],
        guard: { column: 'updated_at', nullMatchesAny: true },
    });
    const b2 = W.bindStep(guarded, ctx());
    assert.deepEqual(b2[0].params, [
        ['a', 'b'],
        ['2026-10-31T00:00:00.000Z', null],
    ]);
    assert.equal(placeholders(b2[0].sql), 2);
    assert.deepEqual(
        W.bindStep(
            W.compileStep(spatial, {
                op: 'deleteKeys',
                map: 'coalitionSpatialItems',
                keys: () => [],
            }),
            ctx()
        ),
        []
    );

    const where = W.compileStep(spatial, {
        op: 'deleteWhere',
        map: 'coalitionSpatialItems',
        where: 'updated_at < $1',
        params: (c) => (c.args.length ? [c.args[0]] : undefined),
    });
    assert.deepEqual(W.bindStep(where, ctx()), []);
    assert.deepEqual(W.bindStep(where, ctx({ args: ['x'] }))[0].params, ['x']);
});

test('guard: a timestamp guard compares milliseconds, so a row stamped by DEFAULT NOW() (microseconds) still matches the mirror copy', async () => {
    const { pg, client, plans } = await shared;
    const plan = plans.find((p) => p.descriptor.mapName === 'coalitionSpatialItems')!;
    const ids = Array.from({ length: 50 }, () => `pin-${randomUUID()}`);
    // Half take the column default; real PostgreSQL stamps NOW() in
    // microseconds, but PGlite's clock ticks in milliseconds, so the other half
    // add sub-millisecond digits explicitly and the test bites on both.
    for (const [i, id] of ids.entries()) {
        await pg.query(
            i % 2 === 0
                ? `INSERT INTO coalition_spatial_items (id, layer, title, latitude, longitude, visibility, event_type, starts_at)
                   VALUES ($1, 'events', 't', 1, 2, 'public', 'flash_sale', NOW())`
                : `INSERT INTO coalition_spatial_items (id, layer, title, latitude, longitude, visibility, event_type, starts_at, updated_at)
                   VALUES ($1, 'events', 't', 1, 2, 'public', 'flash_sale', NOW(), NOW() + interval '317 microseconds')`,
            [id]
        );
    }
    // The mirror's copies, exactly as hydrate() builds them.
    const rows = await W.selectByKeys(
        client,
        plan,
        ids.map((id) => [id])
    );
    assert.equal(rows.length, ids.length);
    const mirror = new Map(rows.map((r) => [String(r.id), W.rowToRecord(plan, r)]));
    const micro = (
        await pg.query(
            `SELECT count(*)::int AS n FROM coalition_spatial_items WHERE id = ANY($1) AND updated_at <> date_trunc('milliseconds', updated_at)`,
            [ids]
        )
    ).rows[0].n as number;
    assert.ok(micro >= ids.length / 2, `${micro} rows carry sub-millisecond digits`);

    const step = W.compileStep(plan, {
        op: 'deleteKey',
        map: 'coalitionSpatialItems',
        key: (c) => [c.args[0]],
        guard: {
            column: 'updated_at',
            value: (c) => c.before('coalitionSpatialItems', String(c.args[0]))?.updatedAt,
        },
    });
    let deleted = 0;
    for (const id of ids) {
        const [s] = W.bindStep(step, ctx({ args: [id], before: (_m, k) => mirror.get(k) }));
        deleted += (await pg.query(s.sql, s.params)).rows.length;
    }
    assert.equal(
        deleted,
        ids.length,
        `every unchanged row matches (${micro} of them had sub-millisecond digits)`
    );

    // A row changed since the mirror saw it is left alone.
    const kept = `pin-${randomUUID()}`;
    await pg.query(
        `INSERT INTO coalition_spatial_items (id, layer, title, latitude, longitude, visibility, event_type, starts_at, updated_at)
         VALUES ($1, 'events', 't', 1, 2, 'public', 'flash_sale', NOW(), '2026-10-31T00:00:00.000Z')`,
        [kept]
    );
    const [s] = W.bindStep(
        step,
        ctx({ args: [kept], before: () => ({ id: kept, updatedAt: '2026-10-30T00:00:00.000Z' }) })
    );
    assert.equal((await pg.query(s.sql, s.params)).rows.length, 0);
    assert.equal((await W.selectByKeys(client, plan, [[kept]])).length, 1);
});

test('selectByKeys and deleteKeys reach composite keys by value, never by a joined string', async () => {
    const { pg, client, plans } = await shared;
    const plan = plans.find((p) => p.descriptor.mapName === 'circleEdges')!;
    const f = `f-${randomUUID()}`;
    const edges = [
        [f, 'a::b'],
        [`${f}::a`, 'b'],
        [f, 'c'],
    ];
    for (const [follower, followee] of edges) {
        await pg.query(
            `INSERT INTO circle_edges (id, follower_id, followee_id, created_at) VALUES ($1, $2, $3, NOW())`,
            [randomUUID(), follower, followee]
        );
    }
    const found = await W.selectByKeys(client, plan, [
        [f, 'a::b'],
        [f, 'missing'],
    ]);
    assert.deepEqual(
        found.map((r) => [r.follower_id, r.followee_id]),
        [[f, 'a::b']]
    );
    const step = W.compileStep(plan, {
        op: 'deleteKeys',
        map: 'circleEdges',
        keys: (c) => (c.args as string[][]).map((kv) => ({ kv })),
    });
    const [s] = W.bindStep(
        step,
        ctx({
            args: [
                [f, 'a::b'],
                [f, 'c'],
            ],
        })
    );
    const res = await pg.query(s.sql, s.params);
    assert.deepEqual(
        res.rows.map((r) => W.keyOfTuple(plan, [r.follower_id, r.followee_id])).sort(),
        [`${f}::a::b`, `${f}::c`].sort()
    );
    const left = await pg.query(
        `SELECT follower_id, followee_id FROM circle_edges WHERE follower_id LIKE $1`,
        [`${f}%`]
    );
    assert.deepEqual(
        left.rows.map((r) => [r.follower_id, r.followee_id]),
        [[`${f}::a`, 'b']]
    );
});
