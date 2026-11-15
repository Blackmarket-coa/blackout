// Serialized async write-behind queue for the PostgresBackedDb store.
//
// The store's mutator API is synchronous (it returns immediately after updating
// the in-memory mirror), so Postgres writes are applied asynchronously here.
// A single FIFO promise chain preserves enqueue order — critical so that an
// upsert followed by a delete of the same key never reorders. Failures are
// logged (and retried once) but never thrown into the event loop; a write that
// fails twice is dropped and counted (db_write_behind_failures_total), and a
// crash loses what is still queued. Graceful shutdown awaits drain(), which
// waits for every queued write, until the shutdown's forced exit.
//
// The queue also keeps a per-key fence: for each (map, key), how many queued
// ops write it. The fence is raised when an op is enqueued, right after the
// mutator changed the mirror, and lowered after the op has run. While a key is
// fenced, a refresh from a peer must not overwrite this process's newer value
// with Postgres's older one; the store skips the key and re-reads it once the
// fence comes down (onKeysLanded).
//
// A targeted op (one mutator call's bound statements) runs on one connection as
// BEGIN; statements; NOTIFY of the changed keys; COMMIT. Peers are therefore
// told about exactly the rows that changed, and only once they have: Postgres
// delivers a NOTIFY on COMMIT and drops it on ROLLBACK. A statement marked
// required that matches no row rolls the whole op back. Afterwards the keys
// where Postgres's effect and the mirror's differ are handed back to the store
// to re-read (onRereadKeys).
//
// A scoped call (enqueueCall with a map and a row's key) is a caller's own
// statements on a connection, ordered only against the queued writes that can
// touch that row: upserts of the row, targeted ops on its map, and earlier
// scoped calls of the row. It does not wait for the FIFO chain, so a backlog of
// writes to other tables does not delay it; a queued write of its row waits
// for it. The dead-man switch's conditional writes are such calls. They are
// not fenced, retried or announced here: the caller awaits the answer, puts
// nothing in the mirror before it, and announces the change itself.

import { log } from '../telemetry/logger';
import {
    dbTargetedWriteConflictsTotal,
    dbWriteBehindDepth,
    dbWriteBehindFailuresTotal,
} from '../telemetry/metrics';
import type { PgClient, PgPool } from './migrate';
import { keyChangePayloads, type StoreChangePayload, type StoreChangeTransport } from './pgNotify';
import { withPooledClient } from './pooledClient';
import {
    keyOfTuple,
    snakeToCamel,
    upsertRecord,
    type BoundStatement,
    type Row,
    type TablePlan,
} from './pgWriter';

/** map -> mirror key -> key column values. */
export type KeySet = Map<string, Map<string, unknown[]>>;

/** One targeted mutator call: its bound statements and the mirror keys it changed. */
export interface TargetedWrite {
    method: string;
    statements: BoundStatement[];
    /** Every key the call changed in the mirror (each is fenced until the op has run). */
    touched: KeySet;
}

type TargetedOutcome =
    /** `merged`: returned keys whose row Postgres merged with the record bound (BoundStatement.merges). */
    | { outcome: 'committed'; returned: KeySet; merged: KeySet }
    | { outcome: 'conflict'; at: BoundStatement };

function addKey(set: KeySet, mapName: string, key: string, kv: unknown[]): void {
    let keys = set.get(mapName);
    if (!keys) {
        keys = new Map();
        set.set(mapName, keys);
    }
    keys.set(key, kv);
}

function union(...sets: KeySet[]): KeySet {
    const out: KeySet = new Map();
    for (const s of sets)
        for (const [m, keys] of s) for (const [k, kv] of keys) addKey(out, m, k, kv);
    return out;
}

/** Keys in exactly one of the two sets. */
function symmetricDifference(a: KeySet, b: KeySet): KeySet {
    const out: KeySet = new Map();
    for (const [x, y] of [
        [a, b],
        [b, a],
    ]) {
        for (const [m, keys] of x) {
            for (const [k, kv] of keys) if (!y.get(m)?.has(k)) addKey(out, m, k, kv);
        }
    }
    return out;
}

function minus(a: KeySet, b: KeySet): KeySet {
    const out: KeySet = new Map();
    for (const [m, keys] of a)
        for (const [k, kv] of keys) if (!b.get(m)?.has(k)) addKey(out, m, k, kv);
    return out;
}

const sizeOf = (set: KeySet) => [...set.values()].reduce((n, keys) => n + keys.size, 0);

type WriteOp = (
    | {
          kind: 'upsert';
          mapName: string;
          record: Record<string, unknown>;
          /** The mirror key of the row written, where it can be computed (`fenceKeyOf`). */
          key?: string;
          /** Fields the stored row must still hold for the update to apply (`upsertRecord`). */
          guard?: Record<string, unknown>;
          /** Written only where no row has the record's key (`ON CONFLICT ... DO NOTHING`). */
          insertOnly?: boolean;
      }
    | {
          kind: 'targeted';
          mapName: string;
          /** Every map a statement of the op names or the call changed in the mirror. */
          maps: string[];
          write: TargetedWrite;
      }
) & {
    /** map -> mirror keys this op writes, counted in the fence while it is queued. */
    fence: Map<string, string[]>;
};

/** The row a queued call (`enqueueCall`) can touch: one map's row by key, or any row of the map. */
export type CallScope = { mapName: string; key?: string };

export class WriteBehindQueue {
    private tail: Promise<void> = Promise.resolve();
    private pending = 0;
    /**
     * The last queued operation that can touch each map's rows (keyed by the
     * map name alone: a targeted op, whose statements name rows by key or by
     * a predicate Postgres evaluates, so any row of each map they name) and
     * each row (keyed by map and key: an upsert, and a scoped call), so a
     * scoped call can be ordered after only the writes that can touch its
     * row and not after the process's writes to other tables (round 11 of
     * the dead-man release review, part 2,
     * docs/security/release-envelope-2026-10-26.md: the owner's check-in
     * waited behind a backlog of the process's writes to other tables and
     * was answered 503, and that one unanswered statement then refused
     * every owner's check-in on the process).
     */
    private readonly lanes = new Map<string, Promise<unknown>>();
    /** Scoped calls not yet settled, so `drain` waits for them too, and by map, so a targeted op on the map waits for them. */
    private readonly calls = new Set<Promise<unknown>>();
    private readonly callsByMap = new Map<string, Set<Promise<unknown>>>();

    private static readonly LANE_SEPARATOR = '\u0000';

    private laneOf(mapName: string, key?: string): string {
        return key === undefined ? mapName : `${mapName}${WriteBehindQueue.LANE_SEPARATOR}${key}`;
    }

    /**
     * Every queued operation that can touch the scope's row(s): the map's
     * whole-table lane and, with a key, the row's; without a key (a targeted
     * op, an upsert whose key cannot be computed, or a call on the whole
     * map), every scoped call on the map still running.
     */
    private before(scope: CallScope): Promise<unknown> {
        const waits: Array<Promise<unknown> | undefined> = [
            this.lanes.get(this.laneOf(scope.mapName)),
        ];
        if (scope.key !== undefined) {
            waits.push(this.lanes.get(this.laneOf(scope.mapName, scope.key)));
        } else {
            waits.push(...(this.callsByMap.get(scope.mapName) ?? []));
        }
        return Promise.allSettled(waits.filter((p): p is Promise<unknown> => p !== undefined));
    }

    /** map -> mirror key -> number of queued ops that write it. */
    private readonly fence = new Map<string, Map<string, number>>();
    private landed: ((mapName: string, keys: string[]) => void) | null = null;
    private reread: ((keys: KeySet) => void) | null = null;

    constructor(
        private readonly pool: PgPool,
        private readonly plans: Map<string, TablePlan>,
        /** Cross-replica change publisher + this instance's id. Omit for single-instance. */
        private readonly transport?: StoreChangeTransport,
        private readonly instanceId = ''
    ) {}

    /** Approximate number of ops not yet flushed (diagnostics / backpressure). */
    get depth(): number {
        return this.pending;
    }

    /** True while a queued op still has to write `key` of `mapName` to Postgres. */
    isFenced(mapName: string, key: string): boolean {
        return (this.fence.get(mapName)?.get(key) ?? 0) > 0;
    }

    /** Every key of `mapName` that a queued op still has to write. */
    fencedKeys(mapName: string): string[] {
        return [...(this.fence.get(mapName)?.keys() ?? [])];
    }

    /** Called with the keys whose last queued write has just run (the fence came down). */
    onKeysLanded(handler: (mapName: string, keys: string[]) => void): void {
        this.landed = handler;
    }

    /** Called after a targeted op with the keys whose mirror value Postgres may not match. */
    onRereadKeys(handler: (keys: KeySet) => void): void {
        this.reread = handler;
    }

    /** Queue one targeted mutator call. Its touched keys are fenced until it has run. */
    enqueueTargeted(write: TargetedWrite): void {
        const fence = new Map<string, string[]>();
        for (const [m, keys] of write.touched) fence.set(m, [...keys.keys()]);
        const named = [...new Set(write.statements.map((s) => s.map))];
        const maps = [...new Set([...named, ...write.touched.keys()])];
        this.schedule({ kind: 'targeted', mapName: named.join(','), maps, write, fence });
    }

    /**
     * Queue an upsert of one record. With `guard`, an existing row is updated
     * only while it still holds those fields; with `insertOnly`, an existing
     * row is left as it is (`upsertRecord`).
     */
    enqueueUpsert(
        mapName: string,
        record: Record<string, unknown>,
        guard?: Record<string, unknown>,
        insertOnly = false
    ): void {
        const fence = new Map<string, string[]>();
        const key = this.fenceKeyOf(mapName, record);
        if (key !== undefined) fence.set(mapName, [key]);
        this.schedule({
            kind: 'upsert',
            mapName,
            record,
            fence,
            ...(key !== undefined ? { key } : {}),
            ...(guard ? { guard } : {}),
            ...(insertOnly ? { insertOnly } : {}),
        });
    }

    /**
     * The mirror key an upsert writes, for the fence and for its lane.
     * Enqueueing runs inside the mutator call, after the mirror has changed,
     * so it must never throw: a key that cannot be computed leaves the write
     * unfenced (a peer refresh may then overwrite it until it lands), which
     * is how it was before the fence existed, and ordered as a write of any
     * row of its map.
     */
    private fenceKeyOf(mapName: string, record: Record<string, unknown>): string | undefined {
        const keyOf = this.plans.get(mapName)?.descriptor.keyOf;
        if (typeof keyOf !== 'function') return undefined;
        try {
            return keyOf(record);
        } catch (err) {
            log.warn('db_write_behind_fence_key_failed', {
                map: mapName,
                error: err instanceof Error ? err.message : String(err),
            });
            return undefined;
        }
    }

    /**
     * Run `fn` on a connection in the queue's order. Without a scope: after
     * every write queued before it has been attempted, and before any queued
     * after it. With a scope (a map and a row's key): after every write
     * queued before it that can touch that row, this process's upserts of
     * the row and its targeted ops on the map, and not after its writes to
     * other rows or tables; a write of that row queued while the call runs
     * waits for it, and so does everything queued after that write. Its
     * result is the returned promise's. Unlike a queued write, it is not
     * retried, logged, fenced or announced here, and a failure is the
     * caller's (the conditional writes of a switch, `writeDeadmanSwitchIf`,
     * which put nothing in the mirror until Postgres has answered, so there
     * is no local value for a refresh to take back).
     */
    enqueueCall<T>(fn: (client: PgClient) => Promise<T>, scope?: CallScope): Promise<T> {
        this.pending += 1;
        dbWriteBehindDepth.set(this.pending);
        const after = scope ? this.before(scope) : this.tail;
        const result = after.then(async () => {
            try {
                const client = await this.pool.connect();
                try {
                    return await fn(client);
                } finally {
                    client.release?.();
                }
            } finally {
                this.pending -= 1;
                dbWriteBehindDepth.set(this.pending);
            }
        });
        const settled = result.then(
            () => undefined,
            () => undefined
        );
        if (scope) {
            this.calls.add(settled);
            let ofMap = this.callsByMap.get(scope.mapName);
            if (!ofMap) {
                ofMap = new Set();
                this.callsByMap.set(scope.mapName, ofMap);
            }
            ofMap.add(settled);
            this.occupy(this.laneOf(scope.mapName, scope.key), settled, () => {
                this.calls.delete(settled);
                ofMap!.delete(settled);
                if (ofMap!.size === 0) this.callsByMap.delete(scope.mapName);
            });
        } else {
            this.tail = settled;
        }
        return result;
    }

    /** `op` holds `lane` until it settles; the entry goes when it settles if nothing later took the lane. */
    private occupy(lane: string, op: Promise<unknown>, then?: () => void): void {
        this.lanes.set(lane, op);
        void op.then(() => {
            if (this.lanes.get(lane) === op) this.lanes.delete(lane);
            then?.();
        });
    }

    private schedule(op: WriteOp): void {
        this.pending += 1;
        dbWriteBehindDepth.set(this.pending);
        this.raise(op.fence);
        // After the tail, as every write, and after each scoped call still
        // running that can touch its rows: for an upsert, one on its row;
        // for a targeted op, one on any row of a map it names (a statement's
        // predicate can reach a row this process has not heard of).
        const scopes: CallScope[] =
            op.kind === 'upsert'
                ? [{ mapName: op.mapName, key: op.key }]
                : op.maps.map((mapName) => ({ mapName }));
        const run = Promise.allSettled([this.tail, ...scopes.map((s) => this.before(s))]).then(() =>
            this.run(op)
        );
        this.tail = run;
        for (const s of scopes) this.occupy(this.laneOf(s.mapName, s.key), run);
    }

    private raise(keys: Map<string, string[]>): void {
        for (const [mapName, ks] of keys) {
            let counts = this.fence.get(mapName);
            if (!counts) {
                counts = new Map();
                this.fence.set(mapName, counts);
            }
            for (const k of ks) counts.set(k, (counts.get(k) ?? 0) + 1);
        }
    }

    private lower(keys: Map<string, string[]>): void {
        for (const [mapName, ks] of keys) {
            const counts = this.fence.get(mapName);
            if (!counts) continue;
            const cleared: string[] = [];
            for (const k of ks) {
                const n = (counts.get(k) ?? 0) - 1;
                if (n > 0) counts.set(k, n);
                else if (counts.delete(k)) cleared.push(k);
            }
            if (counts.size === 0) this.fence.delete(mapName);
            if (cleared.length > 0) this.landed?.(mapName, cleared);
        }
    }

    private async run(op: WriteOp): Promise<void> {
        if (op.kind === 'targeted') {
            let reread: KeySet = new Map();
            try {
                reread = await this.runTargeted(op.mapName, op.write);
            } finally {
                this.pending -= 1;
                dbWriteBehindDepth.set(this.pending);
                // Fence first, so the re-reads below are not skipped for this op's own keys.
                this.lower(op.fence);
                if (sizeOf(reread) > 0) this.reread?.(reread);
            }
            return;
        }
        const plan = this.plans.get(op.mapName);
        if (!plan) {
            this.pending -= 1;
            this.lower(op.fence);
            return;
        }
        try {
            // A failed attempt gives its connection back with the error, so the
            // pool closes it and the retry gets another connection (a new one
            // only when none is idle), never the same dead client.
            await this.withRetry(() =>
                withPooledClient(this.pool, (client) =>
                    upsertRecord(client, plan, op.record, op.guard, op.insertOnly)
                )
            );
            // Tell peer replicas to refresh their mirror for this change.
            if (this.transport) {
                const kv = plan.descriptor.conflictColumns.map((col) =>
                    String(op.record[snakeToCamel(col)])
                );
                this.transport.publish({ src: this.instanceId, m: op.mapName, op: 'u', kv });
            }
        } catch (err) {
            // Permanent failure after the retry: the in-memory mirror has the write
            // but Postgres does not, so a restart loses it and no other process
            // ever sees it. This is the data-loss condition — make it loud AND
            // measurable so alerting can catch it rather than it being silently
            // swallowed.
            dbWriteBehindFailuresTotal.inc({ map: op.mapName, kind: op.kind });
            log.error('db_write_behind_failed', {
                map: op.mapName,
                kind: op.kind,
                error: err instanceof Error ? err.message : String(err),
            });
        } finally {
            this.pending -= 1;
            dbWriteBehindDepth.set(this.pending);
            this.lower(op.fence);
        }
    }

    /**
     * Run one targeted op, retrying once (every statement is idempotent: a
     * keyed delete of a gone row, or a predicate the first attempt already
     * made false, changes nothing the second time). Returns the keys to re-read.
     */
    private async runTargeted(label: string, write: TargetedWrite): Promise<KeySet> {
        // Keys returned by an attempt whose COMMIT was sent but did not report
        // back: that attempt may have committed, so its keys are announced and
        // re-read with whatever the final attempt returns.
        const uncertain: KeySet = new Map();
        let result: TargetedOutcome | null = null;
        try {
            result = await this.withRetry(() => this.attemptTargeted(write, uncertain));
        } catch (err) {
            // As for an upsert: the mirror has the change and Postgres may not.
            dbWriteBehindFailuresTotal.inc({ map: label, kind: 'targeted' });
            log.error('db_write_behind_failed', {
                map: label,
                kind: 'targeted',
                method: write.method,
                error: err instanceof Error ? err.message : String(err),
            });
        }
        const committed = result?.outcome === 'committed' ? result.returned : new Map();
        if (this.transport && !this.transport.publishWithin) {
            // A transport that cannot publish inside the transaction (the
            // in-process test hub) is told after the commit.
            for (const p of this.keyPayloads(union(committed, uncertain)))
                this.transport.publish(p);
        }
        if (result?.outcome === 'conflict') {
            if (sizeOf(uncertain) > 0) {
                // An earlier attempt sent COMMIT and heard nothing back. A
                // required step that misses now may be missing that attempt's
                // own committed effect, so this is not counted as another
                // process getting there first. The keys are re-read either way.
                log.warn('db_targeted_write_conflict_after_uncertain_commit', {
                    map: result.at.map,
                    method: write.method,
                });
            } else {
                dbTargetedWriteConflictsTotal.inc({ map: result.at.map, method: write.method });
                log.warn('db_targeted_write_conflict', {
                    map: result.at.map,
                    method: write.method,
                });
            }
            return union(write.touched, uncertain);
        }
        if (result?.outcome === 'committed') {
            return union(symmetricDifference(write.touched, committed), result.merged, uncertain);
        }
        return minus(uncertain, write.touched);
    }

    private async attemptTargeted(
        write: TargetedWrite,
        uncertain: KeySet
    ): Promise<TargetedOutcome> {
        const returned: KeySet = new Map();
        const merged: KeySet = new Map();
        // As for an upsert, a failed attempt gives its connection back with the
        // error (withPooledClient), so the retry never gets the same dead client.
        return withPooledClient(this.pool, async (client): Promise<TargetedOutcome> => {
            let open = false;
            try {
                await client.query('BEGIN');
                open = true;
                for (const s of write.statements) {
                    const res = await client.query<Row>(s.sql, s.params);
                    const plan = this.plans.get(s.map);
                    if (plan) {
                        for (const row of res.rows) {
                            const kv = plan.descriptor.conflictColumns.map((c) => row[c] ?? null);
                            const key = keyOfTuple(plan, kv);
                            addKey(returned, s.map, key, kv);
                            if (s.merges) addKey(merged, s.map, key, kv);
                        }
                    }
                    if (s.required && res.rows.length === 0) {
                        open = false;
                        await client.query('ROLLBACK');
                        return { outcome: 'conflict', at: s };
                    }
                }
                const transport = this.transport;
                if (transport?.publishWithin) {
                    for (const p of this.keyPayloads(union(returned, uncertain))) {
                        await transport.publishWithin(client, p);
                    }
                }
                open = false;
                try {
                    await client.query('COMMIT');
                } catch (err) {
                    for (const [m, keys] of returned)
                        for (const [k, kv] of keys) addKey(uncertain, m, k, kv);
                    throw err;
                }
                return { outcome: 'committed', returned, merged };
            } catch (err) {
                if (open) await client.query('ROLLBACK').catch(() => undefined);
                throw err;
            }
        });
    }

    private keyPayloads(keys: KeySet): StoreChangePayload[] {
        const out: StoreChangePayload[] = [];
        for (const [m, kvs] of keys) {
            if (kvs.size > 0) out.push(...keyChangePayloads(this.instanceId, m, [...kvs.values()]));
        }
        return out;
    }

    private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
        try {
            return await fn();
        } catch (err) {
            // One retry for transient connection blips; a second failure surfaces to the caller's logger.
            log.warn('db_write_behind_retry', {
                error: err instanceof Error ? err.message : String(err),
            });
            return await fn();
        }
    }

    /** Await all queued writes, scoped calls included — call on graceful shutdown. */
    async drain(): Promise<void> {
        await Promise.allSettled([this.tail, ...this.calls]);
    }
}
