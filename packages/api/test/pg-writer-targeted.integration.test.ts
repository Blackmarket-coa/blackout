// The targeted-statement primitives in pgWriter (compileStep, bindStep,
// keyOfTuple, kvOf, selectByKeys, guardExpr, prepareCheck), checked against
// every table the store maps, with every migration applied to an in-process
// PGlite. They replace resyncMap, which reconciled a whole table against one
// process's mirror and so deleted rows that process had not heard of. Also
// the patch op (only the columns a call changed, one-way columns set only
// where still NULL) and upsertRecord's insert-only and guarded forms.
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
        if (nonKey.length > 0) {
            // The patch's update branch alone, with each option, and with each insert mode.
            const counter = nonKey.find((c) => /^(int[248]|numeric)$/.test(c.udtName));
            const sticky = plan.descriptor.sticky ?? [];
            steps.push(
                { op: 'patch', map },
                {
                    op: 'patch',
                    map,
                    cas: [...classes.values()],
                    where: `${nonKey[0].name} IS NOT NULL`,
                },
                { op: 'patch', map, insertWhenAbsent: 'nothing' },
                { op: 'patch', map, insertWhenAbsent: 'replace' }
            );
            if (counter) {
                steps.push({ op: 'patch', map, delta: [counter.name], insertWhenAbsent: 'add' });
            }
            if (sticky.length > 0) steps.push({ op: 'patch', map, keepStored: [sticky[0]] });
            const c0 = nonKey[0].name;
            steps.push({
                op: 'upsertEach',
                map,
                records: () => [],
                onConflictWhere: `${plan.descriptor.tableName}.${c0} IS NOT DISTINCT FROM EXCLUDED.${c0}`,
                conflictTarget: `(${keys.join(', ')})`,
            });
        }
        for (const column of classes.values()) {
            // upsertRecord's guarded form compares each guard column by its type too.
            const all = plan.columns.map((c) => c.name);
            await W.prepareCheck(client, W.buildUpsertSql(plan, all, [column]));
            await W.prepareCheck(client, W.buildUpsertSql(plan, all, [], true));
            prepared += 2;
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
            assert.equal(
                compiled.insertCheckSql !== undefined,
                step.op === 'patch' && step.insertWhenAbsent !== undefined,
                `insertCheckSql exactly for a patch with insertWhenAbsent: ${JSON.stringify(step)}`
            );
            if (compiled.insertCheckSql !== undefined) {
                // An INSERT, bounded by its conflict target: exempt from the WHERE rule.
                assert.match(compiled.insertCheckSql, /^INSERT INTO /);
                assert.match(compiled.insertCheckSql, new RegExp(`RETURNING ${keys[0]}\\b`));
                await W.prepareCheck(client, compiled.insertCheckSql);
                prepared += 1;
            }
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
        ['missing column', { op: 'patch', map: 'users', cas: ['nope'] }],
        ['missing column', { op: 'patch', map: 'users', delta: ['nope'] }],
        ['missing column', { op: 'patch', map: 'users', keepStored: ['nope'] }],
        ['key column', { op: 'patch', map: 'users', cas: ['id'] }],
        ['not a number', { op: 'patch', map: 'users', delta: ['email'] }],
        ['not sticky', { op: 'patch', map: 'users', keepStored: ['email'] }],
        ["'add' without delta", { op: 'patch', map: 'users', insertWhenAbsent: 'add' }],
        ['arbiter without an insert', { op: 'patch', map: 'users', conflictTarget: '(id)' }],
        ['parameter', { op: 'patch', map: 'users', where: 'email = $1' }],
        ['separator', { op: 'patch', map: 'users', where: "email = 'x'; DELETE FROM users" }],
        [
            'separator',
            {
                op: 'patch',
                map: 'users',
                insertWhenAbsent: 'nothing',
                conflictTarget: '(id); SELECT 1',
            },
        ],
        ['empty', { op: 'upsertEach', map: 'users', records: () => [], onConflictWhere: ' ' }],
        [
            'parameter',
            {
                op: 'upsertEach',
                map: 'users',
                records: () => [],
                onConflictWhere: 'users.email = $1',
            },
        ],
        [
            'parameter',
            {
                op: 'patch',
                map: 'users',
                insertWhenAbsent: 'nothing',
                conflictTarget: '(email) WHERE email <> $1',
            },
        ],
        [
            'separator',
            { op: 'upsertEach', map: 'users', records: () => [], conflictTarget: '(id); SELECT 1' },
        ],
    ];
    for (const [why, step] of bad) {
        assert.throws(() => W.compileStep(users, step), Error, `${why}: ${JSON.stringify(step)}`);
    }
    // A sticky column the table lacks refuses too.
    assert.throws(
        () =>
            W.compileStep(
                { ...users, descriptor: { ...users.descriptor, sticky: ['nope'] } },
                { op: 'patch', map: 'users' }
            ),
        /column nope does not exist/
    );
    // A patch's literal needs no parameter: its key match has one. updateWhere
    // without one is still refused (above).
    const pending = W.compileStep(users, {
        op: 'patch',
        map: 'users',
        where: "reputation_tier = 'member'",
    });
    assert.ok(restrictsByParameter(pending.checkSql), pending.checkSql);
    await W.prepareCheck(client, pending.checkSql);
    // An arbiter no index backs refuses at PREPARE, on a patch's insert branch
    // and on an upsertEach; a partial index's arbiter (the external-reply
    // dedupe index) is accepted.
    const vault = plans.find((p) => p.descriptor.mapName === 'vaultItems')!;
    const unbacked = W.compileStep(vault, {
        op: 'patch',
        map: 'vaultItems',
        insertWhenAbsent: 'nothing',
        conflictTarget: '(label)',
    });
    await assert.rejects(W.prepareCheck(client, unbacked.insertCheckSql!), /ON CONFLICT/);
    await assert.rejects(
        W.prepareCheck(
            client,
            W.compileStep(vault, {
                op: 'upsertEach',
                map: 'vaultItems',
                records: () => [],
                conflictTarget: '(label)',
            }).checkSql
        ),
        /ON CONFLICT/
    );
    const replies = plans.find((p) => p.descriptor.mapName === 'coalitionExternalActivity')!;
    const dedupe = W.compileStep(replies, {
        op: 'patch',
        map: 'coalitionExternalActivity',
        insertWhenAbsent: 'nothing',
        conflictTarget: '(source_platform, external_id) WHERE external_id IS NOT NULL',
    });
    assert.match(
        dedupe.insertCheckSql!,
        /ON CONFLICT \(source_platform, external_id\) WHERE external_id IS NOT NULL DO NOTHING RETURNING id$/
    );
    await W.prepareCheck(client, dedupe.insertCheckSql!);
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
            assert.equal(
                compiled.insertCheckSql !== undefined,
                step.op === 'patch' && step.insertWhenAbsent !== undefined,
                `${method}: insertCheckSql exactly for a patch with insertWhenAbsent`
            );
            // The insert branch is an INSERT: exempt from restrictsByParameter.
            if (compiled.insertCheckSql !== undefined) {
                await W.prepareCheck(client, compiled.insertCheckSql);
            }
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

/** A context whose call changed one key of `map`, from `before` to `after` (either may be absent). */
const changedCtx = (
    map: string,
    before: Record<string, unknown> | undefined,
    after: Record<string, unknown> | undefined,
    key = 'k'
) =>
    ctx({
        changed: (m) =>
            m === map ? [{ key, ...(before ? { before } : {}), ...(after ? { after } : {}) }] : [],
    });

const placeholderCount = (sql: string) =>
    Math.max(0, ...[...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));

test('U3 (patch): the diff rule, the sticky rule, the delta rule and the insert modes, as bound', async () => {
    const { plans } = await shared;
    const burner = plans.find((p) => p.descriptor.mapName === 'burnerIdentities')!;
    assert.deepEqual(
        burner.descriptor.sticky,
        ['burned_at'],
        'the descriptor carries STICKY_COLUMNS'
    );
    const patch = (over: Partial<Extract<TargetedStep, { op: 'patch' }>> = {}) =>
        W.compileStep(burner, { op: 'patch', map: 'burnerIdentities', ...over });
    const id = randomUUID();
    const base = {
        id,
        ownerUserId: 'o',
        burnerUserId: `b-${id}`,
        label: 'l',
        createdAt: '2026-10-31T00:00:00.000Z',
    };
    const bind = (step: ReturnType<typeof patch>, b?: object, a?: object) =>
        W.bindStep(step, changedCtx('burnerIdentities', b as never, a as never));
    const one = (step: ReturnType<typeof patch>, b?: object, a?: object) => {
        const out = bind(step, b, a);
        assert.equal(out.length, 1, JSON.stringify(out));
        assert.equal(placeholderCount(out[0].sql), out[0].params.length, out[0].sql);
        return out[0];
    };

    // No changed column, no statement.
    assert.deepEqual(bind(patch(), base, { ...base }), []);
    // Only the changed column is written, to the one row, and Postgres may refuse it.
    const label = one(patch(), base, { ...base, label: 'm' });
    assert.equal(
        label.sql,
        'UPDATE burner_identities SET label = $1::text WHERE id = $2 RETURNING id'
    );
    assert.deepEqual(label.params, ['m', id]);
    assert.equal(label.refusable, true);
    assert.equal(label.required, false);
    assert.equal(label.merges, undefined);

    // The diff rule's three cases. A column the prior row had and the new
    // record lacks is a bind error.
    const { label: _dropped, ...withoutLabel } = base;
    assert.throws(() => bind(patch(), base, withoutLabel), /dropped label/);
    // A column the prior row lacked binds, NULL included (an own undefined).
    const expires = one(patch(), base, { ...base, expiresAt: undefined });
    assert.match(expires.sql, /^UPDATE burner_identities SET expires_at = \$1::timestamptz WHERE/);
    assert.deepEqual(expires.params, [null, id]);
    // An own null and an own undefined are the same NULL: no change.
    assert.deepEqual(
        bind(patch(), { ...base, expiresAt: null }, { ...base, expiresAt: undefined }),
        []
    );

    // The sticky rule: set only where still NULL.
    const burned = one(patch(), base, { ...base, burnedAt: '2026-11-01T00:00:00.000Z' });
    assert.equal(
        burned.sql,
        'UPDATE burner_identities SET burned_at = $1::timestamptz WHERE id = $2 AND burned_at IS NULL RETURNING id'
    );
    // keepStored: COALESCE instead of the predicate.
    const kept = one(patch({ keepStored: ['burned_at'] }), base, {
        ...base,
        burnedAt: '2026-11-01T00:00:00.000Z',
    });
    assert.equal(
        kept.sql,
        'UPDATE burner_identities SET burned_at = COALESCE(burned_at, $1::timestamptz) WHERE id = $2 RETURNING id'
    );
    // Back to NULL over a value the mirror held: refused at bind.
    assert.throws(
        () =>
            bind(
                patch(),
                { ...base, burnedAt: '2026-11-01T00:00:00.000Z' },
                { ...base, burnedAt: null }
            ),
        /clears burned_at, which moves one way/
    );
    // To NULL over a copy that lacked it: dropped from the SET.
    assert.deepEqual(bind(patch(), base, { ...base, burnedAt: null }), []);
    assert.equal(
        one(patch(), base, { ...base, burnedAt: null, label: 'm' }).sql,
        label.sql,
        'only the other column is written'
    );

    // The delta rule.
    const delta = patch({ delta: ['rotation_epoch'] });
    const plusOne = one(delta, { ...base, rotationEpoch: 2 }, { ...base, rotationEpoch: 3 });
    assert.equal(
        plusOne.sql,
        'UPDATE burner_identities SET rotation_epoch = rotation_epoch + $1::int4 WHERE id = $2 RETURNING id'
    );
    assert.deepEqual(plusOne.params, [1, id]);
    // A prior record lacking the field counts as 0.
    assert.deepEqual(one(delta, base, { ...base, rotationEpoch: 1 }).params, [1, id]);
    // A delta of 0 is no change.
    assert.deepEqual(bind(delta, { ...base, rotationEpoch: 4 }, { ...base, rotationEpoch: 4 }), []);
    for (const bad of ['3', Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.throws(
            () => bind(delta, { ...base, rotationEpoch: 2 }, { ...base, rotationEpoch: bad }),
            /not a finite number/,
            String(bad)
        );
    }

    // cas binds the prior value; where is ANDed as written.
    const cas = one(patch({ cas: ['label'], where: "label <> 'frozen'" }), base, {
        ...base,
        label: 'm',
    });
    assert.equal(
        cas.sql,
        "UPDATE burner_identities SET label = $1::text WHERE id = $2 AND label IS NOT DISTINCT FROM $3::text AND (label <> 'frozen') RETURNING id"
    );
    assert.deepEqual(cas.params, ['m', id, 'l']);

    // A patch never deletes, and inserts only by its mode.
    assert.throws(() => bind(patch(), base, undefined), /never deletes/);
    assert.throws(() => bind(patch(), undefined, base), /no insertWhenAbsent/);
    const nothing = one(patch({ insertWhenAbsent: 'nothing' }), undefined, base);
    assert.match(
        nothing.sql,
        /^INSERT INTO burner_identities \(id, owner_user_id, burner_user_id, label, created_at\) VALUES \(\$1, \$2, \$3, \$4, \$5\) ON CONFLICT \(id\) DO NOTHING RETURNING id$/
    );
    assert.equal(nothing.refusable, true);
    assert.equal(nothing.merges, undefined);
    const add = one(patch({ delta: ['rotation_epoch'], insertWhenAbsent: 'add' }), undefined, base);
    assert.match(
        add.sql,
        /, rotation_epoch\) VALUES .* ON CONFLICT \(id\) DO UPDATE SET rotation_epoch = burner_identities\.rotation_epoch \+ EXCLUDED\.rotation_epoch RETURNING id$/
    );
    assert.equal(add.params.at(-1), 0, 'a counter the record lacks is inserted as 0');
    assert.equal(add.merges, true);
    const linked = plans.find((p) => p.descriptor.mapName === 'linkedAccounts')!;
    const replace = W.bindStep(
        W.compileStep(linked, { op: 'patch', map: 'linkedAccounts', insertWhenAbsent: 'replace' }),
        changedCtx('linkedAccounts', undefined, {
            id: 'i2',
            blackoutUserId: 'u',
            provider: 'twitch',
            providerUserId: 'p',
            accessTokenCiphertext: 'ct',
            encryptionKeyId: 'k',
        })
    );
    assert.match(
        replace[0].sql,
        /ON CONFLICT \(blackout_user_id, provider\) DO UPDATE SET id = linked_accounts\.id, provider_user_id = EXCLUDED\.provider_user_id, access_token_ciphertext = EXCLUDED\.access_token_ciphertext, encryption_key_id = EXCLUDED\.encryption_key_id, created_at = linked_accounts\.created_at RETURNING blackout_user_id, provider$/
    );
    assert.equal(replace[0].merges, true);

    // A statement per changed key.
    const two = W.bindStep(patch(), {
        ...ctx(),
        changed: () => [
            { key: 'a', before: base, after: { ...base, label: 'a' } },
            { key: 'b', before: { ...base, id: 'b' }, after: { ...base, id: 'b', label: 'b' } },
        ],
    });
    assert.deepEqual(
        two.map((s) => s.params),
        [
            ['a', id],
            ['b', 'b'],
        ]
    );
});

test('U3 (patch, run): Postgres keeps the first writer of a sticky column, sums an add, keeps a replaced row id; a refused upsertEach returns no row', async () => {
    const { pg, plans } = await shared;
    const run = async (s: { sql: string; params: unknown[] }) =>
        (await pg.query(s.sql, s.params)).rows.length;
    const burner = plans.find((p) => p.descriptor.mapName === 'burnerIdentities')!;
    const step = (over: Partial<Extract<TargetedStep, { op: 'patch' }>> = {}) =>
        W.compileStep(burner, { op: 'patch', map: 'burnerIdentities', ...over });
    const id = randomUUID();
    const base = { id, ownerUserId: 'o', burnerUserId: `b-${id}`, label: 'l', rotationEpoch: 1 };
    const add = step({ delta: ['rotation_epoch'], insertWhenAbsent: 'add' });
    const [first] = W.bindStep(add, changedCtx('burnerIdentities', undefined, base));
    assert.equal(await run(first), 1);
    assert.equal(await run(first), 1, "the second process's create adds to the first");
    const row = async () =>
        (
            await pg.query(
                'SELECT label, burned_at, rotation_epoch FROM burner_identities WHERE id = $1',
                [id]
            )
        ).rows[0];
    assert.equal((await row()).rotation_epoch, 2);
    const nothing = step({ insertWhenAbsent: 'nothing' });
    assert.equal(
        await run(W.bindStep(nothing, changedCtx('burnerIdentities', undefined, base))[0]),
        0
    );

    // Two processes burn it from the same copy: the first time stays.
    const t1 = '2026-11-01T00:00:00.000Z';
    const t2 = '2026-11-02T00:00:00.000Z';
    const burn = (at: string, s = step()) =>
        W.bindStep(s, changedCtx('burnerIdentities', base, { ...base, burnedAt: at }))[0];
    assert.equal(await run(burn(t1)), 1);
    assert.equal(await run(burn(t2)), 0, 'refused: already set');
    assert.equal(new Date((await row()).burned_at as string).toISOString(), t1);
    // keepStored writes over it without moving it.
    assert.equal(await run(burn(t2, step({ keepStored: ['burned_at'] }))), 1);
    assert.equal(new Date((await row()).burned_at as string).toISOString(), t1);

    // 'replace': the relink lands and the stored id stays.
    const user = randomUUID();
    await pg.query(
        `INSERT INTO users (id, username, email, password_hash) VALUES ($1, $2, $3, 'h')`,
        [user, `u-${user}`, `${user}@e.x`]
    );
    await pg.query(
        `INSERT INTO linked_accounts (id, blackout_user_id, provider, provider_user_id, access_token_ciphertext, encryption_key_id)
         VALUES ($1, $2, 'twitch', 'p1', 'ct1', 'k1')`,
        [randomUUID(), user]
    );
    const before = (
        await pg.query('SELECT id, created_at FROM linked_accounts WHERE blackout_user_id = $1', [
            user,
        ])
    ).rows[0];
    const linked = plans.find((p) => p.descriptor.mapName === 'linkedAccounts')!;
    const [relink] = W.bindStep(
        W.compileStep(linked, { op: 'patch', map: 'linkedAccounts', insertWhenAbsent: 'replace' }),
        changedCtx('linkedAccounts', undefined, {
            id: randomUUID(),
            blackoutUserId: user,
            provider: 'twitch',
            providerUserId: 'p2',
            accessTokenCiphertext: 'ct2',
            encryptionKeyId: 'k2',
        })
    );
    assert.equal(await run(relink), 1);
    const after = (
        await pg.query(
            'SELECT id, created_at, provider_user_id, access_token_ciphertext FROM linked_accounts WHERE blackout_user_id = $1',
            [user]
        )
    ).rows;
    assert.equal(after.length, 1);
    assert.equal(after[0].id, before.id, 'the stored id is kept');
    assert.deepEqual(after[0].created_at, before.created_at);
    assert.equal(after[0].access_token_ciphertext, 'ct2');

    // upsertEach with onConflictWhere: a later cutoff wins, an older one is refused.
    const revoked = plans.find((p) => p.descriptor.mapName === 'revokedSessions')!;
    const cutoff = W.compileStep(revoked, {
        op: 'upsertEach',
        map: 'revokedSessions',
        records: (c) => c.args as Array<Record<string, unknown>>,
        onConflictWhere: 'revoked_sessions.revoked_at <= EXCLUDED.revoked_at',
    });
    const jti = `user-token-cutoff:${user}`;
    const at = (revokedAt: string, reason: string) =>
        W.bindStep(
            cutoff,
            ctx({
                args: [
                    { jti, userId: user, revokedAt, expiresAt: '2027-01-01T00:00:00.000Z', reason },
                ],
            })
        )[0];
    assert.equal(at(t1, 'a').refusable, true);
    assert.equal(await run(at(t2, 'newer')), 1);
    assert.equal(await run(at(t1, 'older')), 0, 'the older cutoff is refused');
    const kept = (
        await pg.query('SELECT revoked_at, reason FROM revoked_sessions WHERE jti = $1', [jti])
    ).rows[0];
    assert.equal(new Date(kept.revoked_at as string).toISOString(), t2);
    assert.equal(kept.reason, 'newer');
});

test('upsertRecord (v46 shape): true when Postgres wrote the row, false when insert-only found one or the guard failed; a guard compares by type; refuses a guard it cannot apply', async () => {
    const { pg, client, plans } = await shared;
    const burner = plans.find((p) => p.descriptor.mapName === 'burnerIdentities')!;
    const id = randomUUID();
    const record = { id, ownerUserId: 'o', burnerUserId: `b-${id}`, label: 'l' };
    assert.equal(await W.upsertRecord(client, burner, record, undefined, true), true);
    assert.equal(
        await W.upsertRecord(client, burner, { ...record, label: 'x' }, undefined, true),
        false
    );
    assert.equal(await W.upsertRecord(client, burner, { ...record, label: 'm' }), true);
    assert.equal(
        await W.upsertRecord(client, burner, { ...record, label: 'n' }, { label: 'l' }),
        false
    );
    assert.equal(
        await W.upsertRecord(client, burner, { ...record, label: 'n' }, { label: 'm' }),
        true
    );
    const label = async () =>
        (await pg.query('SELECT label FROM burner_identities WHERE id = $1', [id])).rows[0].label;
    assert.equal(await label(), 'n');
    // v46's two refusals, word for word.
    await assert.rejects(
        W.upsertRecord(client, burner, record, { label: 'n' }, true),
        /insert-only write on burner_identities carries a guard/
    );
    await assert.rejects(
        W.upsertRecord(client, burner, record, { noSuchField: 'n' }),
        /upsert guard on burner_identities names a field with no column or value/
    );
    await assert.rejects(
        W.upsertRecord(client, burner, record, { label: undefined }),
        /upsert guard on burner_identities names a field with no column or value/
    );
    // A timestamp guard matches a DEFAULT NOW() row (microseconds) from the mirror's copy (milliseconds).
    const spatial = plans.find((p) => p.descriptor.mapName === 'coalitionSpatialItems')!;
    const pin = `pin-${randomUUID()}`;
    await pg.query(
        `INSERT INTO coalition_spatial_items (id, layer, title, latitude, longitude, visibility, event_type, starts_at, updated_at)
         VALUES ($1, 'events', 't', 1, 2, 'public', 'flash_sale', NOW(), NOW() + interval '317 microseconds')`,
        [pin]
    );
    const copy = W.rowToRecord(spatial, (await W.selectByKeys(client, spatial, [[pin]]))[0]);
    assert.equal(
        await W.upsertRecord(
            client,
            spatial,
            { ...copy, title: 'moved' },
            { updatedAt: '2020-01-01T00:00:00.000Z' }
        ),
        false
    );
    assert.equal(
        await W.upsertRecord(
            client,
            spatial,
            { ...copy, title: 'moved' },
            { updatedAt: copy.updatedAt }
        ),
        true,
        'the millisecond copy still matches'
    );
    // The builder itself has no RETURNING (v46 appends its own to it).
    assert.doesNotMatch(W.buildUpsertSql(burner, ['id', 'label'], [], true), /RETURNING/);
});
