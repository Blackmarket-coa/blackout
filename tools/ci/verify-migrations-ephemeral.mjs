/**
 * Boots an in-memory PGlite database, applies every migration in order, and
 * round-trips the reversible (>= NON_REVERSIBLE_FLOOR) ones via their
 * .down.sql + re-applied .up.sql so we know down scripts are not silently
 * broken.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const NON_REVERSIBLE_FLOOR = 7;
const MIGRATIONS_DIR = 'packages/api/src/db/migrations';
const NUMERIC_PREFIX_RE = /^(\d{3,})_/;

const allFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

const upMap = new Map();
const downMap = new Map();
for (const file of allFiles) {
    const base = file.replace(/\.sql$/, '');
    if (base.endsWith('.down')) downMap.set(base.slice(0, -'.down'.length), file);
    else if (base.endsWith('.up')) upMap.set(base.slice(0, -'.up'.length), file);
    else upMap.set(base, file);
}

const migrations = [...upMap.entries()]
    .map(([id, file]) => ({
        id,
        ordinal: Number.parseInt(NUMERIC_PREFIX_RE.exec(id)[1], 10),
        upPath: join(MIGRATIONS_DIR, file),
        downPath: downMap.has(id) ? join(MIGRATIONS_DIR, downMap.get(id)) : null,
    }))
    .sort((a, b) => a.ordinal - b.ordinal);

if (!migrations.length) {
    console.error('No migrations found.');
    process.exit(1);
}

const db = new PGlite();

const tableCount = async () => {
    const result = await db.query(
        `SELECT count(*)::int AS c FROM information_schema.tables WHERE table_schema = 'public'`
    );
    return Number(result.rows[0]?.c ?? 0);
};

/**
 * Capture a structural fingerprint of the public schema: every column (with
 * type / nullability / default), every constraint (by table + type + name),
 * and every index (by full definition). Comparing this before and after a
 * down→up round-trip catches *lossy* rollbacks that a bare table-count check
 * misses — a down script that drops a column, index, constraint, or default
 * and an up script that doesn't faithfully restore it.
 */
const schemaSnapshot = async () => {
    const columns = await db.query(
        `SELECT table_name, column_name, data_type, is_nullable, COALESCE(column_default, '') AS column_default
       FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, column_name`
    );
    const constraints = await db.query(
        // Exclude Postgres's internal NOT NULL representation (`2200_<oid>_<attnum>_not_null`):
        // its name is OID-derived and therefore legitimately changes when a table is
        // dropped and recreated by a down→up cycle. NOT NULL-ness is already asserted
        // via `is_nullable` in the columns snapshot, so nothing is lost by skipping it.
        `SELECT table_name, constraint_type, constraint_name
       FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND constraint_name NOT LIKE '2200%'
      ORDER BY table_name, constraint_type, constraint_name`
    );
    const indexes = await db.query(
        `SELECT tablename, indexname, indexdef
       FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname`
    );
    return {
        columns: columns.rows.map((r) => JSON.stringify(r)),
        constraints: constraints.rows.map((r) => JSON.stringify(r)),
        indexes: indexes.rows.map((r) => JSON.stringify(r)),
    };
};

/** Report set-difference between two snapshot sections (before vs after). */
const diffSection = (label, before, after) => {
    const beforeSet = new Set(before);
    const afterSet = new Set(after);
    const missing = before.filter((x) => !afterSet.has(x)); // lost by the round-trip
    const added = after.filter((x) => !beforeSet.has(x)); // spuriously introduced
    const lines = [];
    for (const m of missing) lines.push(`  - [${label}] not restored after round-trip: ${m}`);
    for (const a of added) lines.push(`  + [${label}] unexpectedly present after round-trip: ${a}`);
    return lines;
};

try {
    for (const m of migrations) {
        const sql = readFileSync(m.upPath, 'utf8');
        await db.exec(sql);
    }

    const tablesAfterUp = await tableCount();
    if (tablesAfterUp <= 0) {
        console.error('Migration verification failed: no tables created in ephemeral DB.');
        process.exit(1);
    }

    const snapshotBefore = await schemaSnapshot();

    // Round-trip the reversible tail: down then up again.
    const reversibles = migrations.filter((m) => m.ordinal >= NON_REVERSIBLE_FLOOR);
    const reversed = [...reversibles].sort((a, b) => b.ordinal - a.ordinal);
    for (const m of reversed) {
        if (!m.downPath) {
            console.error(
                `Migration ${m.id} has no .down.sql but is at or above the reversible floor.`
            );
            process.exit(1);
        }
        const sql = readFileSync(m.downPath, 'utf8');
        await db.exec(sql);
    }

    for (const m of reversibles) {
        const sql = readFileSync(m.upPath, 'utf8');
        await db.exec(sql);
    }

    const tablesAfterRoundTrip = await tableCount();
    if (tablesAfterRoundTrip !== tablesAfterUp) {
        console.error(
            `Migration round-trip changed table count: before=${tablesAfterUp} after=${tablesAfterRoundTrip}.`
        );
        process.exit(1);
    }

    // Stronger check: the full structural fingerprint must be identical. A
    // difference here means at least one reversible down/up pair is lossy.
    const snapshotAfter = await schemaSnapshot();
    const drift = [
        ...diffSection('column', snapshotBefore.columns, snapshotAfter.columns),
        ...diffSection('constraint', snapshotBefore.constraints, snapshotAfter.constraints),
        ...diffSection('index', snapshotBefore.indexes, snapshotAfter.indexes),
    ];
    if (drift.length > 0) {
        console.error(
            'Migration round-trip changed the schema fingerprint (a down/up pair is lossy):'
        );
        for (const line of drift) console.error(line);
        process.exit(1);
    }

    console.log(
        `Ephemeral migration verification passed. tables=${tablesAfterUp} reversible=${reversibles.length} ` +
            `columns=${snapshotBefore.columns.length} constraints=${snapshotBefore.constraints.length} ` +
            `indexes=${snapshotBefore.indexes.length} (schema fingerprint stable across round-trip)`
    );
} finally {
    await db.close();
}
