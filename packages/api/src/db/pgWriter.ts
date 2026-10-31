// Introspection-driven SQL writer for the PostgresBackedDb write-through store.
//
// Rather than hand-maintain a column list per table, we read the actual column
// names + types from information_schema at init and drive INSERT/SELECT
// generically: camelCase record fields ↔ snake_case columns, with serialization
// chosen from the live column type (jsonb → JSON string, timestamptz → ISO
// string on read, arrays/scalars pass through). The set of columns we touch is
// the intersection of (record fields) ∩ (real columns), so a record field with
// no column is silently skipped and a column with no field is left at its
// default — making the writer resilient to schema/record drift.

import type { PgClient } from './migrate';

export type Row = Record<string, unknown>;

export function camelToSnake(value: string): string {
    return value.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

export function snakeToCamel(value: string): string {
    return value.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export interface ColumnMeta {
    name: string;
    dataType: string;
    /** information_schema's udt_name (e.g. 'uuid', 'timestamptz', '_text'): the castable type name. */
    udtName: string;
    nullable: boolean;
}

export async function introspectColumns(client: PgClient, table: string): Promise<ColumnMeta[]> {
    const res = await client.query<{
        column_name: string;
        data_type: string;
        udt_name: string;
        is_nullable: string;
    }>(
        `SELECT column_name, data_type, udt_name, is_nullable FROM information_schema.columns
       WHERE table_name = $1 AND table_schema = 'public'
       ORDER BY ordinal_position`,
        [table]
    );
    return res.rows.map((r) => ({
        name: r.column_name,
        dataType: r.data_type.toLowerCase(),
        udtName: r.udt_name,
        nullable: r.is_nullable === 'YES',
    }));
}

function isJsonType(dataType: string): boolean {
    return dataType === 'jsonb' || dataType === 'json';
}

function isTimestampType(dataType: string): boolean {
    return dataType === 'timestamp with time zone' || dataType === 'timestamp without time zone';
}

/** Record value → SQL parameter, chosen by the live column type. */
export function serializeValue(value: unknown, column: ColumnMeta): unknown {
    if (value === undefined || value === null) return null;
    if (isJsonType(column.dataType)) return JSON.stringify(value);
    // '' means "absent" in legacy file-store records (e.g. the emailless users
    // minted by the Matrix token-exchange flow). Store it as NULL wherever the
    // column allows, so UNIQUE constraints — which exempt NULL but not '' —
    // don't collide (users_email_key). NOT NULL columns keep '' as a value.
    if (value === '' && column.nullable) return null;
    // Arrays (TEXT[]/UUID[]) and scalars (incl. ISO timestamp strings) pass through;
    // node-postgres / PGlite encode JS arrays as Postgres arrays natively.
    return value;
}

/** SQL row value → record value. */
export function deserializeValue(value: unknown, dataType: string): unknown {
    if (value === null || value === undefined) return null;
    if (isTimestampType(dataType) && value instanceof Date) return value.toISOString();
    return value;
}

/**
 * A table's runtime plan: its descriptor plus the columns discovered in
 * Postgres. Built once at init.
 */
export interface TableDescriptor {
    /** InMemoryDb map field name. */
    mapName: string;
    tableName: string;
    /** In-memory key for a record — MUST match store.ts hydrate()'s key expression. */
    keyOf: (record: Record<string, unknown>) => string;
    /** Natural/composite key columns used as the ON CONFLICT target + delete predicate. */
    conflictColumns: string[];
    /** Override the default reflection mapping (e.g. nested fields). */
    toRow?: (record: Record<string, unknown>) => Row;
    fromRow?: (row: Row) => Record<string, unknown>;
}

export interface TablePlan {
    descriptor: TableDescriptor;
    columns: ColumnMeta[];
    columnNames: Set<string>;
}

function defaultToRow(record: Record<string, unknown>): Row {
    const raw: Row = {};
    for (const [k, v] of Object.entries(record)) raw[camelToSnake(k)] = v;
    return raw;
}

function defaultFromRow(row: Row): Record<string, unknown> {
    const rec: Record<string, unknown> = {};
    for (const [col, value] of Object.entries(row)) {
        // null → field omitted, matching the JSON store's drop-undefined behaviour.
        if (value === null) continue;
        rec[snakeToCamel(col)] = value;
    }
    return rec;
}

/** Build the {column → serialized value} object actually written, intersected with real columns. */
export function recordToRow(plan: TablePlan, record: Record<string, unknown>): Row {
    const raw = plan.descriptor.toRow ? plan.descriptor.toRow(record) : defaultToRow(record);
    const out: Row = {};
    for (const col of plan.columns) {
        if (Object.prototype.hasOwnProperty.call(raw, col.name)) {
            out[col.name] = serializeValue(raw[col.name], col);
        }
    }
    return out;
}

/** Reconstruct a record from a DB row (deserialized + mapped back to camelCase). */
export function rowToRecord(plan: TablePlan, row: Row): Record<string, unknown> {
    const deserialized: Row = {};
    for (const col of plan.columns) {
        deserialized[col.name] = deserializeValue(row[col.name], col.dataType);
    }
    return plan.descriptor.fromRow
        ? plan.descriptor.fromRow(deserialized)
        : defaultFromRow(deserialized);
}

function columnMeta(plan: TablePlan, name: string): ColumnMeta | undefined {
    return plan.columns.find((c) => c.name === name);
}

/**
 * The mirror key of the row whose key columns hold `kv` (conflict-column
 * order). Built through the descriptor's own `keyOf`, exactly as hydrate()
 * keys a row, so it can never disagree with the mirror the way a string join
 * of the values can (circleEdges keys on `a::b`, linkedAccounts on `a:b`).
 */
export function keyOfTuple(plan: TablePlan, kv: readonly unknown[]): string {
    const row: Row = {};
    plan.descriptor.conflictColumns.forEach((c, i) => {
        row[c] = kv[i] ?? null;
    });
    return plan.descriptor.keyOf(rowToRecord(plan, row));
}

/** A record's key column values, serialized exactly as the writer stores them. */
export function kvOf(plan: TablePlan, record: Record<string, unknown>): unknown[] {
    const raw = plan.descriptor.toRow ? plan.descriptor.toRow(record) : defaultToRow(record);
    return plan.descriptor.conflictColumns.map((c) => {
        const meta = columnMeta(plan, c);
        return meta ? serializeValue(raw[c], meta) : raw[c] ?? null;
    });
}

export function buildUpsertSql(plan: TablePlan, columns: string[]): string {
    const conflict = plan.descriptor.conflictColumns;
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const updates = columns.filter((c) => !conflict.includes(c)).map((c) => `${c} = EXCLUDED.${c}`);
    const doClause = updates.length > 0 ? `DO UPDATE SET ${updates.join(', ')}` : 'DO NOTHING';
    return (
        `INSERT INTO ${plan.descriptor.tableName} (${columns.join(
            ', '
        )}) VALUES (${placeholders}) ` + `ON CONFLICT (${conflict.join(', ')}) ${doClause}`
    );
}

/** Insert-or-update a single record. */
export async function upsertRecord(
    client: PgClient,
    plan: TablePlan,
    record: Record<string, unknown>
): Promise<void> {
    const row = recordToRow(plan, record);
    const columns = Object.keys(row);
    if (columns.length === 0) return;
    const sql = buildUpsertSql(plan, columns);
    await client.query(
        sql,
        columns.map((c) => row[c])
    );
}

/** Load every row of a table and write it into the in-memory map via keyOf. */
export async function hydrateMap(
    client: PgClient,
    plan: TablePlan,
    map: Map<string, unknown>
): Promise<void> {
    const res = await client.query<Row>(`SELECT * FROM ${plan.descriptor.tableName}`);
    for (const row of res.rows) {
        const record = rowToRecord(plan, row);
        map.set(plan.descriptor.keyOf(record), record);
    }
}

// ---------------------------------------------------------------------------
// Targeted statements.
//
// A targeted write names the rows it may change, by key or by a predicate that
// Postgres evaluates, instead of reconciling a whole table against this
// process's mirror (which deletes every row the mirror has not heard of, and
// rewrites every row from the mirror's possibly stale copy). A step's SQL is
// fixed per (step, table) and checked against the live schema with PREPARE at
// boot; its values are always bound parameters, computed when the mutator call
// returns. Every UPDATE and DELETE has a WHERE that uses a parameter, and every
// statement returns the key columns of the rows it changed.

/** What a step's value functions read: the call's arguments and result, and the mirror before it. */
export interface StepContext {
    args: readonly unknown[];
    result: unknown;
    /** The mirror's record for `key` in `map` as it was before the call. */
    before(map: string, key: string): Record<string, unknown> | undefined;
    /**
     * Every key of `map` the call changed in the mirror, with its record before
     * and after (undefined where the key was absent). A statement that must
     * write what the mutator chose (a timestamp it took itself) reads it here.
     */
    changed(map: string): ReadonlyArray<{
        key: string;
        before?: Record<string, unknown>;
        after?: Record<string, unknown>;
    }>;
    /** ISO time at which the call returned. */
    at: string;
}

/**
 * "Only while the row still holds what this process saw." The comparison is
 * chosen by the column's type: timestamps at millisecond precision (the mirror
 * keeps ISO strings, while a `DEFAULT NOW()` stores microseconds, so plain
 * equality would match almost nothing), JSON as jsonb, anything else by value.
 * It is NULL-safe: a null or undefined value matches only a NULL column, unless
 * `nullMatchesAny` is set, in which case it matches every row.
 */
export interface StepGuard {
    column: string;
    nullMatchesAny?: boolean;
}

interface StepBase {
    /** The InMemoryDb map (and so the table) the step writes. */
    map: string;
    /** A miss (no row returned) rolls back the whole op. */
    required?: boolean;
}

export type TargetedStep =
    | (StepBase & {
          op: 'deleteKey';
          /** Key column values in conflict-column order, or undefined to skip the step for this call. */
          key: (ctx: StepContext) => readonly unknown[] | undefined;
          guard?: StepGuard & { value: (ctx: StepContext) => unknown };
      })
    | (StepBase & {
          op: 'deleteKeys';
          /** One entry per row: its key column values, plus its guard value when the step has a guard. */
          keys: (ctx: StepContext) => ReadonlyArray<{ kv: readonly unknown[]; guard?: unknown }>;
          guard?: StepGuard;
      })
    | (StepBase & {
          op: 'deleteWhere';
          /** A literal predicate over this table's columns using $1..$n. */
          where: string;
          params: (ctx: StepContext) => readonly unknown[] | undefined;
      })
    | (StepBase & {
          op: 'updateWhere';
          /** A literal SET list and predicate sharing one $1..$n numbering. */
          set: string;
          where: string;
          params: (ctx: StepContext) => readonly unknown[] | undefined;
      })
    | (StepBase & {
          op: 'upsertEach';
          records: (ctx: StepContext) => ReadonlyArray<Record<string, unknown>>;
          /** Per-column ON CONFLICT expressions that replace `c = EXCLUDED.c` (e.g. a set union). */
          onConflictSet?: Readonly<Record<string, string>>;
      });

/** One statement ready to run: literal SQL and its bound parameters. */
export interface BoundStatement {
    map: string;
    sql: string;
    params: unknown[];
    required: boolean;
}

export interface CompiledStep {
    step: TargetedStep;
    plan: TablePlan;
    /**
     * The statement as PREPAREd at boot and, except for upsertEach, as run.
     * upsertEach runs one INSERT per record over that record's columns; its
     * check statement names every column of the table.
     */
    checkSql: string;
}

const SIMPLE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function quoteIdentifier(name: string): string {
    return SIMPLE_IDENTIFIER.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
}

/** The type a parameter is cast to for this column (arrays as `elem[]`). */
export function sqlTypeOf(column: ColumnMeta): string {
    const udt = column.udtName;
    return udt.startsWith('_') ? `${quoteIdentifier(udt.slice(1))}[]` : quoteIdentifier(udt);
}

/** `columnRef` still equals `valueRef`, compared by the column's type (see StepGuard). */
export function guardExpr(column: ColumnMeta, columnRef: string, valueRef: string): string {
    if (isTimestampType(column.dataType)) {
        const t = column.dataType === 'timestamp with time zone' ? 'timestamptz' : 'timestamp';
        return (
            `date_trunc('milliseconds', ${columnRef}) IS NOT DISTINCT FROM ` +
            `date_trunc('milliseconds', ${valueRef}::${t})`
        );
    }
    if (isJsonType(column.dataType)) {
        const lhs = column.dataType === 'json' ? `${columnRef}::jsonb` : columnRef;
        return `${lhs} IS NOT DISTINCT FROM ${valueRef}::jsonb`;
    }
    return `${columnRef} IS NOT DISTINCT FROM ${valueRef}::${sqlTypeOf(column)}`;
}

function guardCondition(
    column: ColumnMeta,
    columnRef: string,
    valueRef: string,
    nullMatchesAny: boolean | undefined
): string {
    const cmp = guardExpr(column, columnRef, valueRef);
    if (!nullMatchesAny) return cmp;
    const t = isJsonType(column.dataType) ? 'jsonb' : sqlTypeOf(column);
    return `(${valueRef}::${t} IS NULL OR ${cmp})`;
}

/** Key column match: plain `=` (index-friendly) unless the column is nullable. */
function keyCondition(column: ColumnMeta, columnRef: string, valueRef: string): string {
    return column.nullable
        ? `${columnRef} IS NOT DISTINCT FROM ${valueRef}::${sqlTypeOf(column)}`
        : `${columnRef} = ${valueRef}`;
}

function buildTargetedUpsertSql(
    plan: TablePlan,
    columns: string[],
    onConflictSet: Readonly<Record<string, string>> | undefined
): string {
    const keys = plan.descriptor.conflictColumns;
    const sets = columns
        .filter((c) => !keys.includes(c))
        .map((c) => `${c} = ${onConflictSet?.[c] ?? `EXCLUDED.${c}`}`);
    for (const [c, expr] of Object.entries(onConflictSet ?? {})) {
        if (!columns.includes(c)) sets.push(`${c} = ${expr}`);
    }
    const action = sets.length > 0 ? `DO UPDATE SET ${sets.join(', ')}` : 'DO NOTHING';
    return (
        `INSERT INTO ${plan.descriptor.tableName} (${columns.join(', ')}) ` +
        `VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) ` +
        `ON CONFLICT (${keys.join(', ')}) ${action} RETURNING ${keys.join(', ')}`
    );
}

/**
 * Compile a step against its table. Throws when the step names a key or
 * guard column the table lacks, when a predicate uses no parameter (an
 * UPDATE or DELETE that could only ever match every row or none), or when a
 * literal holds a statement separator. Column names inside `where`/`set`
 * literals are checked by prepareCheck at boot.
 */
export function compileStep(plan: TablePlan, step: TargetedStep): CompiledStep {
    const table = plan.descriptor.tableName;
    const keys = plan.descriptor.conflictColumns;
    const fail = (why: string) => new Error(`targeted ${step.op} on ${table}: ${why}`);
    const column = (name: string): ColumnMeta => {
        const meta = columnMeta(plan, name);
        if (!meta) throw fail(`column ${name} does not exist`);
        return meta;
    };
    const literal = (what: string, text: string) => {
        if (text.trim().length === 0) throw fail(`${what} is empty`);
        if (text.includes(';')) throw fail(`${what} holds a statement separator`);
    };
    const predicate = (where: string) => {
        literal('where', where);
        if (!/\$[1-9]\d*/.test(where)) throw fail(`where uses no parameter: ${where}`);
    };
    const keyMeta = keys.map(column);
    const returning = (alias: string) => keys.map((k) => `${alias}${k}`).join(', ');
    let checkSql: string;
    switch (step.op) {
        case 'deleteKey': {
            const conds = keyMeta.map((c, i) => keyCondition(c, c.name, `$${i + 1}`));
            if (step.guard) {
                const g = column(step.guard.column);
                conds.push(
                    guardCondition(g, g.name, `$${keys.length + 1}`, step.guard.nullMatchesAny)
                );
            }
            checkSql = `DELETE FROM ${table} WHERE ${conds.join(' AND ')} RETURNING ${returning(
                ''
            )}`;
            break;
        }
        case 'deleteKeys': {
            const arrays = keyMeta.map((c, i) => `$${i + 1}::${sqlTypeOf(c)}[]`);
            const names = keyMeta.map((_, i) => `k${i}`);
            const conds = keyMeta.map((c, i) => keyCondition(c, `x.${c.name}`, `d.${names[i]}`));
            if (step.guard) {
                const g = column(step.guard.column);
                const t = isJsonType(g.dataType) ? 'jsonb' : sqlTypeOf(g);
                arrays.push(`$${keys.length + 1}::${t}[]`);
                names.push('g');
                conds.push(guardCondition(g, `x.${g.name}`, 'd.g', step.guard.nullMatchesAny));
            }
            checkSql =
                `DELETE FROM ${table} AS x USING unnest(${arrays.join(', ')}) AS d(${names.join(
                    ', '
                )}) ` + `WHERE ${conds.join(' AND ')} RETURNING ${returning('x.')}`;
            break;
        }
        case 'deleteWhere':
            predicate(step.where);
            checkSql = `DELETE FROM ${table} WHERE ${step.where} RETURNING ${returning('')}`;
            break;
        case 'updateWhere':
            literal('set', step.set);
            predicate(step.where);
            checkSql = `UPDATE ${table} SET ${step.set} WHERE ${step.where} RETURNING ${returning(
                ''
            )}`;
            break;
        case 'upsertEach':
            for (const [c, expr] of Object.entries(step.onConflictSet ?? {})) {
                column(c);
                literal(`onConflictSet.${c}`, expr);
            }
            checkSql = buildTargetedUpsertSql(
                plan,
                plan.columns.map((c) => c.name),
                step.onConflictSet
            );
            break;
    }
    return { step, plan, checkSql };
}

/** Bind a compiled step for one call: zero statements when the step does not apply to it. */
export function bindStep(compiled: CompiledStep, ctx: StepContext): BoundStatement[] {
    const { step, plan } = compiled;
    const keys = plan.descriptor.conflictColumns;
    const required = step.required === true;
    const meta = (name: string) => columnMeta(plan, name)!;
    const bound = (params: unknown[]): BoundStatement[] => [
        { map: step.map, sql: compiled.checkSql, params, required },
    ];
    const keyArity = (kv: readonly unknown[]) => {
        if (kv.length !== keys.length) {
            throw new Error(
                `targeted ${step.op} on ${plan.descriptor.tableName}: ${kv.length} key values for ${keys.length} key columns`
            );
        }
    };
    switch (step.op) {
        case 'deleteKey': {
            const kv = step.key(ctx);
            if (!kv) return [];
            keyArity(kv);
            const params = kv.map((v, i) => serializeValue(v, meta(keys[i])));
            if (step.guard)
                params.push(serializeValue(step.guard.value(ctx), meta(step.guard.column)));
            return bound(params);
        }
        case 'deleteKeys': {
            const entries = step.keys(ctx);
            if (entries.length === 0) return [];
            entries.forEach((e) => keyArity(e.kv));
            const arrays: unknown[] = keys.map((k, i) =>
                entries.map((e) => serializeValue(e.kv[i], meta(k)))
            );
            const guard = step.guard;
            if (guard) arrays.push(entries.map((e) => serializeValue(e.guard, meta(guard.column))));
            return bound(arrays);
        }
        case 'deleteWhere':
        case 'updateWhere': {
            const params = step.params(ctx);
            return params ? bound([...params]) : [];
        }
        case 'upsertEach':
            return step.records(ctx).map((record) => {
                const row = recordToRow(plan, record);
                const columns = Object.keys(row);
                for (const k of keys) {
                    if (!columns.includes(k)) {
                        throw new Error(
                            `targeted upsertEach on ${plan.descriptor.tableName}: record has no ${k}`
                        );
                    }
                }
                return {
                    map: step.map,
                    sql: buildTargetedUpsertSql(plan, columns, step.onConflictSet),
                    params: columns.map((c) => row[c]),
                    required,
                };
            });
    }
}

/** `SELECT *` of the rows whose keys are `kvs`, as one statement whatever their number. */
export function selectByKeysSql(plan: TablePlan): string {
    const cols = plan.descriptor.conflictColumns.map((c) => columnMeta(plan, c)!);
    const names = cols.map((_, i) => `k${i}`);
    return (
        `SELECT x.* FROM ${plan.descriptor.tableName} AS x JOIN unnest(${cols
            .map((c, i) => `$${i + 1}::${sqlTypeOf(c)}[]`)
            .join(', ')}) AS d(${names.join(', ')}) ON ` +
        cols.map((c, i) => keyCondition(c, `x.${c.name}`, `d.${names[i]}`)).join(' AND ')
    );
}

/** Read the rows whose keys are `kvs` (conflict-column order). A key with no row is simply absent. */
export async function selectByKeys(
    client: PgClient,
    plan: TablePlan,
    kvs: ReadonlyArray<readonly unknown[]>
): Promise<Row[]> {
    if (kvs.length === 0) return [];
    const params = plan.descriptor.conflictColumns.map((c, i) => {
        const meta = columnMeta(plan, c)!;
        return kvs.map((kv) => serializeValue(kv[i], meta));
    });
    const res = await client.query<Row>(selectByKeysSql(plan), params);
    return res.rows;
}

/**
 * Check a statement against the live schema without running it: PREPARE
 * rejects an unknown table or column and a parameter whose type cannot be
 * inferred, which are exactly the errors the statement would otherwise first
 * raise in the write-behind queue, after the mirror had already changed.
 */
export async function prepareCheck(
    client: PgClient,
    sql: string,
    name = 'blackout_targeted_check'
): Promise<void> {
    await client.query(`PREPARE ${name} AS ${sql}`);
    await client.query(`DEALLOCATE ${name}`);
}
