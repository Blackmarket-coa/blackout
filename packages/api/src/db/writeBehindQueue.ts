// Serialized async write-behind queue for the PostgresBackedDb store.
//
// The store's mutator API is synchronous (it returns immediately after updating
// the in-memory mirror), so Postgres writes are applied asynchronously here.
// A single FIFO promise chain preserves enqueue order — critical so that an
// upsert followed by a delete of the same key never reorders. Failures are
// logged and tried again at once (withRetry: once, and on another connection
// for as long as the one the write was given had ended, within a bound) but
// never thrown into the event loop; a write that is given up is dropped and
// counted (db_write_behind_failures_total), and a crash loses what is still
// queued. Graceful shutdown awaits drain(), which waits for every queued
// write, until the shutdown's forced exit.
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
import type { PgClient, PgPool } from './migrate';
import { keyChangePayloads, type StoreChangePayload, type StoreChangeTransport } from './pgNotify';
import { attemptOnPooledClient } from './pooledClient';
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

/**
 * How many connections `pool` holds: pg-pool's `totalCount`, which counts the
 * idle ones, the ones checked out and the ones still connecting. Zero for a
 * pool that does not say.
 */
const connectionsHeldBy = (pool: PgPool): number => {
    const held = (pool as { totalCount?: unknown }).totalCount;
    return typeof held === 'number' && Number.isInteger(held) && held > 0 ? held : 0;
};

type WriteOp = (
    | { kind: 'upsert'; mapName: string; record: Record<string, unknown> }
    | { kind: 'targeted'; mapName: string; write: TargetedWrite }
) & {
    /** map -> mirror keys this op writes, counted in the fence while it is queued. */
    fence: Map<string, string[]>;
};

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
            // A failed attempt gives its connection back with the error, so the
            // pool closes it and the next attempt gets another connection (a
            // new one only when none is idle), never the same dead client.
            await this.withRetry((client) => upsertRecord(client, plan, op.record));
            // Tell peer replicas to refresh their mirror for this change.
            if (this.transport) {
                const kv = plan.descriptor.conflictColumns.map((col) =>
                    String(op.record[snakeToCamel(col)])
                );
                this.transport.publish({ src: this.instanceId, m: op.mapName, op: 'u', kv });
            }
        } catch (err) {
            // Permanent failure after the last attempt: the in-memory mirror has the write
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
     * Run one targeted op, trying again as withRetry does (every statement is
     * idempotent: a keyed delete of a gone row, or a predicate an earlier
     * attempt already made false, changes nothing the next time). Returns the
     * keys to re-read.
     */
    private async runTargeted(label: string, write: TargetedWrite): Promise<KeySet> {
        // Keys returned by an attempt whose COMMIT was sent but did not report
        // back: that attempt may have committed, so its keys are announced and
        // re-read with whatever the final attempt returns. One set for every
        // attempt, however many there are.
        const uncertain: KeySet = new Map();
        let result: TargetedOutcome | null = null;
        try {
            result = await this.withRetry((client) =>
                this.attemptTargeted(client, write, uncertain)
            );
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

    /**
     * One attempt at a targeted op, on `client`. A failed attempt leaves no
     * transaction open on a connection that is still up: a failure inside the
     * transaction is rolled back here, and a COMMIT the server refuses has
     * ended it.
     */
    private async attemptTargeted(
        client: PgClient,
        write: TargetedWrite,
        uncertain: KeySet
    ): Promise<TargetedOutcome> {
        const returned: KeySet = new Map();
        const merged: KeySet = new Map();
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
    }

    private keyPayloads(keys: KeySet): StoreChangePayload[] {
        const out: StoreChangePayload[] = [];
        for (const [m, kvs] of keys) {
            if (kvs.size > 0) out.push(...keyChangePayloads(this.instanceId, m, [...kvs.values()]));
        }
        return out;
    }

    /**
     * Run `fn` on a pooled connection, and again at once after a failure.
     * How often depends on what failed:
     * - the attempt's connection had ended (attemptOnPooledClient asks it):
     *   again on another connection, once for every connection the pool
     *   still held when the first one was found ended, and once more;
     * - anything else (no connection to be had; a statement that failed on a
     *   connection that still answers): once, whatever else the write's
     *   attempts fail with.
     * So a write is attempted at most once for every connection the pool held
     * when the first one was found ended, that one included, once more, and
     * once again for a failure of the second kind: twelve times at most with
     * pg-pool's default of ten connections.
     *
     * Why more than once. The server can end several of the process's
     * sessions together (a failover, every backend of the role terminated)
     * and still take connections. pg-pool (3.13.0) hands out an idle
     * connection without asking anything of it, and it learns that one has
     * ended only when the event loop reads that connection's socket. An
     * attempt made before then can be handed it: on PostgreSQL 16 the one
     * retry of a write whose own connection had been ended was handed an idle
     * connection ended by the same statement, failed on it with the server's
     * 57P01, and the write was dropped with Postgres up.
     *
     * Why that many. A failed attempt gives its connection back with the
     * error, so the pool destroys it and never hands it out again. Any of the
     * connections the pool holds when the first one is found ended may have
     * ended with it. Once each of those has been handed out and destroyed,
     * an attempt can only be on a connection opened since, so of that many
     * attempts and one more, at least one is. If every one of them finds its
     * connection ended, the server has ended a session it took after the
     * first failure as well, and the write is given up. A pool that does not
     * say how many connections it holds (a test's stand-in) is taken to hold
     * no others: one further attempt.
     *
     * What an attempt on an ended connection can have done. Nothing, where
     * the server had ended the session before the attempt's first statement
     * reached it: every attempt on a connection that ended while it sat idle.
     * Otherwise the server may have applied the write and ended the session,
     * or lost the connection, before its answer arrived: an upsert whose
     * statement was sent, a targeted op whose COMMIT was sent. Both are sent
     * again all the same: the upsert writes the same row, and a targeted
     * op's statements change nothing a second time, with the keys of a
     * COMMIT that was sent and not answered kept in `uncertain` across every
     * attempt (runTargeted).
     */
    private async withRetry<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
        /** Attempts left for a write whose connection has just been found ended. */
        let endedLeft: number | null = null;
        let retried = false;
        for (let attempt = 1; ; attempt += 1) {
            const result = await attemptOnPooledClient(this.pool, fn);
            if (result.ok) return result.value;
            if (result.connectionEnded) {
                endedLeft = endedLeft === null ? connectionsHeldBy(this.pool) + 1 : endedLeft - 1;
                if (endedLeft === 0) throw result.error;
            } else {
                if (retried) throw result.error;
                retried = true;
            }
            log.warn('db_write_behind_retry', {
                attempt,
                connectionEnded: result.connectionEnded,
                error: result.error instanceof Error ? result.error.message : String(result.error),
            });
        }
    }

    /** Await all queued writes — call on graceful shutdown. */
    async drain(): Promise<void> {
        await this.tail;
    }
}
