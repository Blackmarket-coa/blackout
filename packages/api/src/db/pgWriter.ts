// Introspection-driven SQL writer for the PostgresBackedDb write-behind store.
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
    /**
     * Columns that move one way (pgDescriptors' STICKY_COLUMNS): a patch sets
     * one only where it is still NULL, so Postgres keeps the first writer.
     */
    sticky?: string[];
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

/**
 * `INSERT ... ON CONFLICT ... DO UPDATE`. With `guardColumns`, the update
 * applies only where the stored row's columns equal the values that follow
 * the record's in the parameters (`DO UPDATE ... WHERE`): a compare-and-set,
 * so a write does not land over a row another process changed meanwhile.
 * With `insertOnly`, `ON CONFLICT ... DO NOTHING`: the record is written only
 * where no row has its key, and a stored row is never changed.
 */
export function buildUpsertSql(
    plan: TablePlan,
    columns: string[],
    guardColumns: string[] = [],
    insertOnly = false
): string {
    const conflict = plan.descriptor.conflictColumns;
    const table = plan.descriptor.tableName;
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const updates = insertOnly
        ? []
        : columns.filter((c) => !conflict.includes(c)).map((c) => `${c} = EXCLUDED.${c}`);
    const doClause = updates.length > 0 ? `DO UPDATE SET ${updates.join(', ')}` : 'DO NOTHING';
    const guard =
        updates.length > 0 && guardColumns.length > 0
            ? ` WHERE ${guardColumns
                  .map((c, i) => {
                      // By the column's type (guardExpr: a timestamp at millisecond
                      // precision, JSON as jsonb, NULL-safe), as a targeted step's
                      // guard is: the mirror keeps ISO strings while a DEFAULT NOW()
                      // stores microseconds, so plain equality would refuse almost
                      // every such row.
                      const meta = columnMeta(plan, c);
                      if (!meta) throw new Error(`upsert guard on ${table}: no column ${c}`);
                      return guardCondition(
                          meta,
                          `${table}.${c}`,
                          `$${columns.length + i + 1}`,
                          undefined
                      );
                  })
                  .join(' AND ')}`
            : '';
    return (
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ` +
        `ON CONFLICT (${conflict.join(', ')}) ${doClause}${guard}`
    );
}

/**
 * Insert-or-update a single record. With `guard` (record fields and the
 * values the stored row must still hold), an existing row is updated only if
 * it holds them; each guard field must have a column and a value, or nothing
 * is written and this throws, rather than drop the condition. With
 * `insertOnly`, an existing row is left as it is (a guard is then refused
 * too, since it could only ever compare an update).
 */
export async function upsertRecord(
    client: PgClient,
    plan: TablePlan,
    record: Record<string, unknown>,
    guard?: Record<string, unknown>,
    insertOnly = false
): Promise<boolean> {
    const row = recordToRow(plan, record);
    const columns = Object.keys(row);
    if (columns.length === 0) return false;
    if (insertOnly && guard) {
        throw new Error(`insert-only write on ${plan.descriptor.tableName} carries a guard`);
    }
    const guardRow = guard ? recordToRow(plan, guard) : {};
    const guardColumns = Object.keys(guardRow);
    if (
        guard &&
        (guardColumns.length !== Object.keys(guard).length ||
            guardColumns.some((c) => guardRow[c] === null))
    ) {
        throw new Error(
            `upsert guard on ${plan.descriptor.tableName} names a field with no column or value`
        );
    }
    // RETURNING is appended here, not by buildUpsertSql, whose text a caller
    // may append its own RETURNING to. With it this resolves whether Postgres
    // wrote the row: false when an insert-only write found a row with the key
    // or the guard no longer held (and, above, for a record with no column).
    // The write-behind queue re-reads a refused write's key instead of
    // announcing it.
    const sql = `${buildUpsertSql(
        plan,
        columns,
        guardColumns,
        insertOnly
    )} RETURNING ${plan.descriptor.conflictColumns.join(', ')}`;
    const res = await client.query(sql, [
        ...columns.map((c) => row[c]),
        ...guardColumns.map((c) => guardRow[c]),
    ]);
    return res.rows.length > 0;
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
          /**
           * A literal condition over the stored row (the table's name) and
           * EXCLUDED, appended as `DO UPDATE SET ... WHERE <literal>`: where it
           * is false the stored row stays as it is, the statement returns no
           * row, and the key is counted as a conflict and re-read (refusable;
           * after an uncertain COMMIT the miss is logged, not counted).
           */
          onConflictWhere?: string;
          /** The arbiter after ON CONFLICT, replacing `(<conflict columns>)`: a column list, optionally with a partial index's predicate. */
          conflictTarget?: string;
      })
    | (StepBase & {
          /**
           * Write only the columns the call changed, to each row it changed
           * (the diff of the two records as recordToRow writes them). A
           * descriptor's sticky column is set only where it is still NULL,
           * so Postgres keeps the first writer. A row Postgres refuses to
           * change (gone, a predicate false) is counted (after an uncertain
           * COMMIT, logged instead) and re-read, never inserted, and the op's
           * other statements still commit.
           */
          op: 'patch';
          /** Compare-and-set: columns that must still hold the value the mirror held before the call (guardExpr: ms timestamps, jsonb, NULL-safe). */
          cas?: string[];
          /** A literal predicate over this table's columns, with no parameter, ANDed to the key match (`status = 'pending'`). */
          where?: string;
          /**
           * Counter columns written as `c = c + (after - before)` instead of `c = after`. A prior
           * value that is absent or null counts as 0. The new record must hold a finite number for
           * the difference to mean anything: one that drops the counter, or holds null for it, is a
           * bind error, never a write that subtracts the prior count. An insert has no prior to
           * subtract from, so there an absent or null counter is inserted as 0, the column's default.
           */
          delta?: string[];
          /** Sticky columns this step may set even where the stored row already has them: `c = COALESCE(c, $n)` replaces the `c IS NULL` predicate. */
          keepStored?: string[];
          /**
           * What to do with a key the call added (the mirror had no row). Default: a bind error (a patch
           * spec on a creating method is a spec bug, made loud). 'nothing': insert, or leave the stored
           * row as it is (a true create). 'add': insert, or add this record's `delta` columns to the
           * stored row and touch nothing else (needs `delta`). 'replace': insert, or overwrite the
           * stored row's columns this record carries, keeping its id and created_at (refused on a
           * table with a sticky column, which it would overwrite).
           */
          insertWhenAbsent?: 'nothing' | 'add' | 'replace';
          /** The insert branch's arbiter, replacing `(<conflict columns>)` after ON CONFLICT: a column list, optionally with a partial-index predicate. */
          conflictTarget?: string;
      });

/** One statement ready to run: literal SQL and its bound parameters. */
export interface BoundStatement {
    map: string;
    sql: string;
    params: unknown[];
    required: boolean;
    /**
     * The row Postgres keeps may differ from the record bound (an upsertEach
     * whose onConflictSet merges the two, a patch that adds to a counter or
     * keeps the stored id), so the keys this statement returns are re-read
     * into the writer's own mirror.
     */
    merges?: boolean;
    /**
     * Postgres may refuse the row (a patch whose predicate no longer holds,
     * an upsertEach whose onConflictWhere is false). No row returned is
     * counted as a conflict (only logged when an earlier attempt's COMMIT
     * reply was lost, since the miss may be that attempt's own effect) and
     * the key is re-read, but unlike `required` nothing is rolled back: the
     * op's other statements still commit.
     */
    refusable?: true;
}

export interface CompiledStep {
    step: TargetedStep;
    plan: TablePlan;
    /**
     * The statement as PREPAREd at boot and, except for upsertEach and
     * patch, as run. upsertEach runs one INSERT per record over that record's
     * columns, and patch one UPDATE per changed key over the columns the call
     * changed; their check statements name every column of the table.
     */
    checkSql: string;
    /**
     * A patch with insertWhenAbsent only: its insert branch over every column
     * of the table, PREPAREd at boot beside checkSql, so an arbiter no index
     * backs refuses the boot. It is an INSERT, bounded by its conflict target,
     * not by a WHERE.
     */
    insertCheckSql?: string;
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

interface TargetedUpsertOptions {
    /** The arbiter after ON CONFLICT, instead of the conflict columns. */
    conflictTarget?: string;
    /** `DO UPDATE SET ... WHERE <literal>`. */
    onConflictWhere?: string;
    /** `DO NOTHING`, whatever the columns. */
    insertOnly?: boolean;
}

function insertHead(
    plan: TablePlan,
    columns: string[],
    conflictTarget: string | undefined
): string {
    const keys = plan.descriptor.conflictColumns;
    return (
        `INSERT INTO ${plan.descriptor.tableName} (${columns.join(', ')}) ` +
        `VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) ` +
        `ON CONFLICT ${conflictTarget ?? `(${keys.join(', ')})`}`
    );
}

function buildTargetedUpsertSql(
    plan: TablePlan,
    columns: string[],
    onConflictSet: Readonly<Record<string, string>> | undefined,
    options: TargetedUpsertOptions = {}
): string {
    const keys = plan.descriptor.conflictColumns;
    const sets = options.insertOnly
        ? []
        : columns
              .filter((c) => !keys.includes(c))
              .map((c) => `${c} = ${onConflictSet?.[c] ?? `EXCLUDED.${c}`}`);
    if (!options.insertOnly) {
        for (const [c, expr] of Object.entries(onConflictSet ?? {})) {
            if (!columns.includes(c) && !keys.includes(c)) sets.push(`${c} = ${expr}`);
        }
    }
    const where = options.onConflictWhere ? ` WHERE ${options.onConflictWhere}` : '';
    const action = sets.length > 0 ? `DO UPDATE SET ${sets.join(', ')}${where}` : 'DO NOTHING';
    return `${insertHead(plan, columns, options.conflictTarget)} ${action} RETURNING ${keys.join(
        ', '
    )}`;
}

/** A patch's 'add' insert: on conflict only the counters are summed, and nothing else is touched. */
function buildInsertOrAddSql(
    plan: TablePlan,
    columns: string[],
    deltaColumns: readonly string[],
    conflictTarget: string | undefined
): string {
    const table = plan.descriptor.tableName;
    const keys = plan.descriptor.conflictColumns;
    const sums = deltaColumns.map((c) => `${c} = ${table}.${c} + EXCLUDED.${c}`);
    return `${insertHead(plan, columns, conflictTarget)} DO UPDATE SET ${sums.join(
        ', '
    )} RETURNING ${keys.join(', ')}`;
}

type PatchStep = Extract<TargetedStep, { op: 'patch' }>;

/** `udt_name`s a delta column may have: arithmetic on them is exact. */
const COUNTER_TYPES = new Set(['int2', 'int4', 'int8', 'numeric']);

/** A 'replace' insert keeps the stored row's id and created_at (those the table has, outside its key). */
function replaceKeeps(plan: TablePlan): Record<string, string> {
    const table = plan.descriptor.tableName;
    const keep: Record<string, string> = {};
    for (const c of ['id', 'created_at']) {
        if (plan.columnNames.has(c) && !plan.descriptor.conflictColumns.includes(c)) {
            keep[c] = `${table}.${c}`;
        }
    }
    return keep;
}

/** A patch's insert branch over `columns`, by its insertWhenAbsent mode. */
function patchInsertSql(plan: TablePlan, step: PatchStep, columns: string[]): string {
    switch (step.insertWhenAbsent) {
        case 'add':
            return buildInsertOrAddSql(plan, columns, step.delta ?? [], step.conflictTarget);
        case 'replace':
            return buildTargetedUpsertSql(plan, columns, replaceKeeps(plan), {
                conflictTarget: step.conflictTarget,
            });
        default:
            return buildTargetedUpsertSql(plan, columns, undefined, {
                insertOnly: true,
                conflictTarget: step.conflictTarget,
            });
    }
}

/**
 * A patch's UPDATE. Parameters: the SET values in order, then the key, then
 * each `cas` column's prior value. A sticky column the SET writes plainly
 * gets `c IS NULL`; one written as `keep` is COALESCEd instead.
 */
function patchUpdateSql(
    plan: TablePlan,
    sets: ReadonlyArray<{ column: ColumnMeta; how: 'value' | 'delta' | 'keep' }>,
    stickyUnset: readonly string[],
    cas: readonly ColumnMeta[],
    where: string | undefined
): string {
    const keys = plan.descriptor.conflictColumns.map((c) => columnMeta(plan, c)!);
    let n = 0;
    const next = () => `$${++n}`;
    const assignments = sets.map(({ column: c, how }) => {
        const v = `${next()}::${sqlTypeOf(c)}`;
        if (how === 'delta') return `${c.name} = ${c.name} + ${v}`;
        if (how === 'keep') return `${c.name} = COALESCE(${c.name}, ${v})`;
        return `${c.name} = ${v}`;
    });
    const conds = keys.map((k) => keyCondition(k, k.name, next()));
    for (const s of stickyUnset) conds.push(`${s} IS NULL`);
    for (const c of cas) conds.push(guardExpr(c, c.name, next()));
    if (where !== undefined) conds.push(`(${where})`);
    return (
        `UPDATE ${plan.descriptor.tableName} SET ${assignments.join(', ')} ` +
        `WHERE ${conds.join(' AND ')} RETURNING ${keys.map((k) => k.name).join(', ')}`
    );
}

const hasColumn = (row: Row, c: string) => Object.prototype.hasOwnProperty.call(row, c);

/** Serialized column values compared as written: scalars by value, arrays (and anything else) by JSON. */
function sameValue(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
        return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
}

/** Bind a patch for each key the call changed in its map (bindStep). */
function bindPatch(compiled: CompiledStep, step: PatchStep, ctx: StepContext): BoundStatement[] {
    const { plan } = compiled;
    const table = plan.descriptor.tableName;
    const keys = plan.descriptor.conflictColumns;
    const fail = (why: string) => new Error(`targeted patch on ${table}: ${why}`);
    const delta = new Set(step.delta ?? []);
    const keep = new Set(step.keepStored ?? []);
    const sticky = new Set(plan.descriptor.sticky ?? []);
    const counter = (v: unknown, what: string): number => {
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        throw fail(`${what} is ${String(v)}, not a finite number`);
    };
    const out: BoundStatement[] = [];
    for (const { key, before, after } of ctx.changed(step.map)) {
        if (!after) throw fail(`the call removed ${key}; a patch never deletes`);
        const is = recordToRow(plan, after);
        for (const k of keys) if (!hasColumn(is, k)) throw fail(`record has no ${k}`);
        if (!before) {
            if (!step.insertWhenAbsent) {
                throw fail(
                    `the call added ${key}, which the mirror did not hold (no insertWhenAbsent)`
                );
            }
            // A counter the record lacks, or holds null for, is inserted as 0,
            // its column's default.
            for (const d of delta) {
                is[d] = hasColumn(is, d) && is[d] !== null ? counter(is[d], `${d} of ${key}`) : 0;
            }
            const columns = Object.keys(is);
            out.push({
                map: step.map,
                sql: patchInsertSql(plan, step, columns),
                params: columns.map((c) => is[c]),
                required: step.required === true,
                refusable: true,
                ...(step.insertWhenAbsent === 'nothing' ? {} : { merges: true }),
            });
            continue;
        }
        const was = recordToRow(plan, before);
        const sets: Array<{ column: ColumnMeta; how: 'value' | 'delta' | 'keep'; value: unknown }> =
            [];
        const stickyUnset: string[] = [];
        for (const column of plan.columns) {
            const c = column.name;
            if (keys.includes(c)) continue;
            const inWas = hasColumn(was, c);
            const inIs = hasColumn(is, c);
            if (!inIs) {
                // A patch carries every column its prior row had; a method
                // clears one by setting the field to undefined or null.
                if (inWas) throw fail(`the call dropped ${c} from ${key}`);
                continue;
            }
            if (delta.has(c)) {
                // The prior counts as 0 when absent or null; the new value must
                // be a number (a dropped one is refused above, a null one here).
                const prior = inWas && was[c] !== null ? counter(was[c], `prior ${c}`) : 0;
                const d = counter(is[c], `${c}`) - prior;
                if (!Number.isFinite(d)) throw fail(`${c} changes by ${d}`);
                if (d !== 0) sets.push({ column, how: 'delta', value: d });
                continue;
            }
            if (inWas && sameValue(was[c], is[c])) continue;
            if (sticky.has(c)) {
                if (is[c] === null) {
                    // One-way: writing it back over a value the mirror held is a
                    // revert; over a copy that lacked it, a no-op (dropped).
                    if (inWas && was[c] !== null)
                        throw fail(`the call clears ${c}, which moves one way`);
                    continue;
                }
                if (keep.has(c)) {
                    sets.push({ column, how: 'keep', value: is[c] });
                    continue;
                }
                stickyUnset.push(c);
            }
            sets.push({ column, how: 'value', value: is[c] });
        }
        if (sets.length === 0) continue;
        const cas = (step.cas ?? []).map((c) => columnMeta(plan, c)!);
        out.push({
            map: step.map,
            sql: patchUpdateSql(plan, sets, stickyUnset, cas, step.where),
            params: [
                ...sets.map((s) => s.value),
                ...keys.map((k) => is[k]),
                ...cas.map((c) => (hasColumn(was, c.name) ? was[c.name] : null)),
            ],
            required: step.required === true,
            refusable: true,
        });
    }
    return out;
}

/**
 * Compile a step against its table. Throws when the step names a key or
 * guard column the table lacks, when a predicate uses no parameter (an
 * UPDATE or DELETE that could only ever match every row or none), or when a
 * literal holds a statement separator. Column names inside `where`/`set`
 * literals are checked by prepareCheck at boot.
 *
 * A patch also throws when a cas, delta, keepStored or sticky column is
 * missing (or, but for sticky, is a key column), a delta column is not a
 * number, a keepStored column is not sticky, its where literal takes a
 * parameter, 'add' has no delta, 'replace' is on a table with a sticky
 * column, or conflictTarget comes without insertWhenAbsent. Its key match
 * carries the parameter, so a literal such as
 * `status = 'pending'` is allowed on it.
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
    /** A literal that takes no parameter: its statement's numbering is the builder's. */
    const unbound = (what: string, text: string) => {
        literal(what, text);
        if (/\$\d/.test(text)) throw fail(`${what} takes no parameter: ${text}`);
    };
    const keyMeta = keys.map(column);
    const returning = (alias: string) => keys.map((k) => `${alias}${k}`).join(', ');
    let checkSql: string;
    let insertCheckSql: string | undefined;
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
            if (step.onConflictWhere !== undefined)
                unbound('onConflictWhere', step.onConflictWhere);
            if (step.conflictTarget !== undefined) unbound('conflictTarget', step.conflictTarget);
            checkSql = buildTargetedUpsertSql(
                plan,
                plan.columns.map((c) => c.name),
                step.onConflictSet,
                { conflictTarget: step.conflictTarget, onConflictWhere: step.onConflictWhere }
            );
            break;
        case 'patch': {
            // Option columns must exist and lie outside the key; the boot
            // PREPARE then checks the where literal and the arbiter.
            const outsideKey = (what: string, names: readonly string[] | undefined) =>
                (names ?? []).map((name) => {
                    const meta = column(name);
                    if (keys.includes(name)) throw fail(`${what} names the key column ${name}`);
                    return meta;
                });
            const cas = outsideKey('cas', step.cas);
            const delta = outsideKey('delta', step.delta);
            for (const d of delta) {
                if (!COUNTER_TYPES.has(d.udtName)) {
                    throw fail(`delta column ${d.name} is ${d.udtName}, not a number`);
                }
            }
            const sticky = (plan.descriptor.sticky ?? []).map(column);
            const keep = outsideKey('keepStored', step.keepStored);
            for (const k of keep) {
                if (!sticky.includes(k)) throw fail(`keepStored column ${k.name} is not sticky`);
            }
            // Its key match always carries a parameter; the literals take
            // none (the SET's columns, and so its numbering, differ from call
            // to call).
            if (step.where !== undefined) unbound('where', step.where);
            if (step.conflictTarget !== undefined) {
                unbound('conflictTarget', step.conflictTarget);
                if (!step.insertWhenAbsent) throw fail('conflictTarget without insertWhenAbsent');
            }
            if (step.insertWhenAbsent === 'add' && delta.length === 0) {
                throw fail("insertWhenAbsent 'add' without a delta column");
            }
            // 'replace' writes every column the record carries over the stored
            // row, so a one-way column could go back to NULL or to a later
            // writer's value: Postgres must keep the first writer.
            if (step.insertWhenAbsent === 'replace' && sticky.length > 0) {
                throw fail(
                    `insertWhenAbsent 'replace' on a table with one-way columns (${sticky
                        .map((s) => s.name)
                        .join(', ')}), which its DO UPDATE would overwrite`
                );
            }
            const nonKey = plan.columns.filter((c) => !keys.includes(c.name));
            if (nonKey.length === 0) throw fail('the table has no column outside its key');
            const how = (c: ColumnMeta): 'value' | 'delta' | 'keep' =>
                delta.includes(c) ? 'delta' : keep.includes(c) ? 'keep' : 'value';
            checkSql = patchUpdateSql(
                plan,
                nonKey.map((c) => ({ column: c, how: how(c) })),
                sticky
                    .filter((s) => !keep.includes(s) && !keys.includes(s.name))
                    .map((s) => s.name),
                cas,
                step.where
            );
            if (step.insertWhenAbsent) {
                insertCheckSql = patchInsertSql(
                    plan,
                    step,
                    plan.columns.map((c) => c.name)
                );
            }
            break;
        }
    }
    return { step, plan, checkSql, ...(insertCheckSql !== undefined ? { insertCheckSql } : {}) };
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
        case 'patch':
            return bindPatch(compiled, step, ctx);
        case 'upsertEach': {
            const merges = Object.keys(step.onConflictSet ?? {}).length > 0;
            const options = {
                conflictTarget: step.conflictTarget,
                onConflictWhere: step.onConflictWhere,
            };
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
                    sql: buildTargetedUpsertSql(plan, columns, step.onConflictSet, options),
                    params: columns.map((c) => row[c]),
                    required,
                    ...(merges ? { merges } : {}),
                    ...(step.onConflictWhere !== undefined ? { refusable: true as const } : {}),
                };
            });
        }
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
 *
 * PREPARE parses and analyses a statement but does not plan it, and an
 * INSERT's ON CONFLICT arbiter is matched to a unique index only when it is
 * planned, so an INSERT is also EXPLAINed (planned, not run) with NULL for
 * each parameter: an arbiter no index backs is refused here, not by the
 * first write. Its literals take no parameter (compileStep), so every `$n`
 * in it is a VALUES placeholder.
 */
export async function prepareCheck(
    client: PgClient,
    sql: string,
    name = 'blackout_targeted_check'
): Promise<void> {
    await client.query(`PREPARE ${name} AS ${sql}`);
    await client.query(`DEALLOCATE ${name}`);
    if (/^INSERT\b/.test(sql)) await client.query(`EXPLAIN ${sql.replace(/\$\d+/g, 'NULL')}`);
}
