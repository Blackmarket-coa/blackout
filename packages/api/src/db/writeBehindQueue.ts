// Serialized async write-behind queue for the PostgresBackedDb store.
//
// The store's mutator API is synchronous (it returns immediately after updating
// the in-memory mirror), so Postgres writes are applied asynchronously here.
// A single FIFO promise chain preserves enqueue order — critical so that an
// upsert followed by a delete of the same key never reorders. Failures are
// logged (and retried once) but never thrown into the event loop; durability is
// therefore eventual, bounded by drain() on graceful shutdown.
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

import { log } from '../telemetry/logger';
import {
    dbTargetedWriteConflictsTotal,
    dbWriteBehindDepth,
    dbWriteBehindFailuresTotal,
} from '../telemetry/metrics';
import type { PgPool } from './migrate';
import { keyChangePayloads, type StoreChangePayload, type StoreChangeTransport } from './pgNotify';
import {
    keyOfTuple,
    resyncMap,
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
    | { outcome: 'committed'; returned: KeySet }
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
    | { kind: 'upsert'; mapName: string; record: Record<string, unknown> }
    | { kind: 'resync'; mapName: string }
    | { kind: 'targeted'; mapName: string; write: TargetedWrite }
) & {
    /** map -> mirror keys this op writes, counted in the fence while it is queued. */
    fence: Map<string, string[]>;
};

export type MapAccessor = (mapName: string) => Map<string, Record<string, unknown>> | undefined;

export class WriteBehindQueue {
    private tail: Promise<void> = Promise.resolve();
    private pending = 0;
    /** map -> mirror key -> number of queued ops that write it. */
    private readonly fence = new Map<string, Map<string, number>>();
    private landed: ((mapName: string, keys: string[]) => void) | null = null;
    private reread: ((keys: KeySet) => void) | null = null;

    constructor(
        private readonly pool: PgPool,
        private readonly plans: Map<string, TablePlan>,
        private readonly getMap: MapAccessor,
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
        const mapName = [...new Set(write.statements.map((s) => s.map))].join(',');
        this.schedule({ kind: 'targeted', mapName, write, fence });
    }

    enqueueUpsert(mapName: string, record: Record<string, unknown>): void {
        const fence = new Map<string, string[]>();
        const key = this.fenceKeyOf(mapName, record);
        if (key !== undefined) fence.set(mapName, [key]);
        this.schedule({ kind: 'upsert', mapName, record, fence });
    }

    /**
     * The mirror key an upsert writes, for the fence. Enqueueing runs inside
     * the mutator call, after the mirror has changed, so it must never throw:
     * a key that cannot be computed leaves the write unfenced (a peer refresh
     * may then overwrite it until it lands), which is how it was before the
     * fence existed.
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

    enqueueResync(mapName: string): void {
        this.schedule({ kind: 'resync', mapName, fence: new Map() });
    }

    private schedule(op: WriteOp): void {
        this.pending += 1;
        dbWriteBehindDepth.set(this.pending);
        this.raise(op.fence);
        this.tail = this.tail.then(() => this.run(op));
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
            await this.withRetry(async () => {
                const client = await this.pool.connect();
                try {
                    if (op.kind === 'upsert') {
                        await upsertRecord(client, plan, op.record);
                    } else {
                        const map = this.getMap(op.mapName);
                        if (map) await resyncMap(client, plan, map);
                    }
                } finally {
                    client.release?.();
                }
            });
            // Tell peer replicas to refresh their mirror for this change.
            if (this.transport) {
                if (op.kind === 'upsert') {
                    const kv = plan.descriptor.conflictColumns.map((col) =>
                        String(op.record[snakeToCamel(col)])
                    );
                    this.transport.publish({ src: this.instanceId, m: op.mapName, op: 'u', kv });
                } else {
                    this.transport.publish({ src: this.instanceId, m: op.mapName, op: 'r' });
                }
            }
        } catch (err) {
            // Permanent failure after the retry: the in-memory mirror has the write
            // but Postgres does not, so a crash before a later resync loses it. This
            // is the data-loss condition — make it loud AND measurable so alerting
            // can catch it rather than it being silently swallowed.
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
            dbTargetedWriteConflictsTotal.inc({ map: result.at.map, method: write.method });
            log.warn('db_targeted_write_conflict', { map: result.at.map, method: write.method });
            return union(write.touched, uncertain);
        }
        if (result?.outcome === 'committed') {
            return union(symmetricDifference(write.touched, committed), uncertain);
        }
        return minus(uncertain, write.touched);
    }

    private async attemptTargeted(
        write: TargetedWrite,
        uncertain: KeySet
    ): Promise<TargetedOutcome> {
        const returned: KeySet = new Map();
        const client = await this.pool.connect();
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
                        addKey(returned, s.map, keyOfTuple(plan, kv), kv);
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
            return { outcome: 'committed', returned };
        } catch (err) {
            if (open) await client.query('ROLLBACK').catch(() => undefined);
            throw err;
        } finally {
            client.release?.();
        }
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

    /** Await all queued writes — call on graceful shutdown. */
    async drain(): Promise<void> {
        await this.tail;
    }
}
