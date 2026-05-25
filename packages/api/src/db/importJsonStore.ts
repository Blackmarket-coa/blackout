// One-time importer: load a file-mode store snapshot (store.json, the
// PersistedState shape written by FileBackedDb) into Postgres via the same
// descriptor-driven upsert the write-through store uses. Idempotent — upserts
// on the natural key, so re-running is safe. Per-row failures (e.g. a legacy
// UUID column rejecting a synthetic id, or an FK gap) are logged and skipped
// rather than aborting the whole import.

import { log } from '../telemetry/logger';
import type { PgClient } from './migrate';
import { TABLE_DESCRIPTORS } from './pgDescriptors';
import { introspectColumns, upsertRecord, type TablePlan } from './pgWriter';

/** store.json shape: an array of records per store map name. */
export type PersistedSnapshot = Record<string, Array<Record<string, unknown>>>;

export interface ImportSummary {
  imported: Record<string, number>;
  failed: Record<string, number>;
  totalImported: number;
  totalFailed: number;
}

export async function importJsonStoreState(
  client: PgClient,
  state: PersistedSnapshot,
): Promise<ImportSummary> {
  const summary: ImportSummary = { imported: {}, failed: {}, totalImported: 0, totalFailed: 0 };

  for (const descriptor of TABLE_DESCRIPTORS) {
    const rows = state[descriptor.mapName];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const columns = await introspectColumns(client, descriptor.tableName);
    if (columns.length === 0) {
      log.warn('import_json_store_table_missing', { table: descriptor.tableName });
      continue;
    }
    const plan: TablePlan = {
      descriptor,
      columns,
      columnNames: new Set(columns.map((c) => c.name)),
    };

    let ok = 0;
    let bad = 0;
    for (const record of rows) {
      try {
        await upsertRecord(client, plan, record);
        ok += 1;
      } catch (err) {
        bad += 1;
        log.warn('import_json_store_row_failed', {
          table: descriptor.tableName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    summary.imported[descriptor.mapName] = ok;
    if (bad > 0) summary.failed[descriptor.mapName] = bad;
    summary.totalImported += ok;
    summary.totalFailed += bad;
  }

  return summary;
}
