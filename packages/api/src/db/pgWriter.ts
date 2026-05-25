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
}

export async function introspectColumns(client: PgClient, table: string): Promise<ColumnMeta[]> {
  const res = await client.query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = $1 AND table_schema = 'public'
       ORDER BY ordinal_position`,
    [table],
  );
  return res.rows.map((r) => ({ name: r.column_name, dataType: r.data_type.toLowerCase() }));
}

function isJsonType(dataType: string): boolean {
  return dataType === 'jsonb' || dataType === 'json';
}

function isTimestampType(dataType: string): boolean {
  return dataType === 'timestamp with time zone' || dataType === 'timestamp without time zone';
}

/** Record value → SQL parameter, chosen by the live column type. */
export function serializeValue(value: unknown, dataType: string): unknown {
  if (value === undefined || value === null) return null;
  if (isJsonType(dataType)) return JSON.stringify(value);
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
      out[col.name] = serializeValue(raw[col.name], col.dataType);
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
  return plan.descriptor.fromRow ? plan.descriptor.fromRow(deserialized) : defaultFromRow(deserialized);
}

export function buildUpsertSql(plan: TablePlan, columns: string[]): string {
  const conflict = plan.descriptor.conflictColumns;
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const updates = columns
    .filter((c) => !conflict.includes(c))
    .map((c) => `${c} = EXCLUDED.${c}`);
  const doClause = updates.length > 0 ? `DO UPDATE SET ${updates.join(', ')}` : 'DO NOTHING';
  return `INSERT INTO ${plan.descriptor.tableName} (${columns.join(', ')}) VALUES (${placeholders}) ` +
    `ON CONFLICT (${conflict.join(', ')}) ${doClause}`;
}

/** Insert-or-update a single record. */
export async function upsertRecord(
  client: PgClient,
  plan: TablePlan,
  record: Record<string, unknown>,
): Promise<void> {
  const row = recordToRow(plan, record);
  const columns = Object.keys(row);
  if (columns.length === 0) return;
  const sql = buildUpsertSql(plan, columns);
  await client.query(
    sql,
    columns.map((c) => row[c]),
  );
}

/** Load every row of a table and write it into the in-memory map via keyOf. */
export async function hydrateMap(
  client: PgClient,
  plan: TablePlan,
  map: Map<string, unknown>,
): Promise<void> {
  const res = await client.query<Row>(`SELECT * FROM ${plan.descriptor.tableName}`);
  for (const row of res.rows) {
    const record = rowToRecord(plan, row);
    map.set(plan.descriptor.keyOf(record), record);
  }
}

/**
 * Reconcile a table to the current in-memory map: delete PG rows whose key is
 * no longer in memory, then upsert every in-memory record. Used for delete /
 * bulk-revoke / consume mutators where rows may have been removed — it needs
 * only the map name, no per-method key extraction.
 */
export async function resyncMap(
  client: PgClient,
  plan: TablePlan,
  map: Map<string, Record<string, unknown>>,
): Promise<void> {
  const conflict = plan.descriptor.conflictColumns;
  const existing = await client.query<Row>(
    `SELECT ${conflict.join(', ')} FROM ${plan.descriptor.tableName}`,
  );
  const liveKeys = new Set(map.keys());
  for (const row of existing.rows) {
    const key = conflict.map((c) => String(row[c])).join(':');
    if (!liveKeys.has(key)) {
      const where = conflict.map((c, i) => `${c} = $${i + 1}`).join(' AND ');
      await client.query(
        `DELETE FROM ${plan.descriptor.tableName} WHERE ${where}`,
        conflict.map((c) => row[c]),
      );
    }
  }
  for (const record of map.values()) {
    await upsertRecord(client, plan, record);
  }
}
