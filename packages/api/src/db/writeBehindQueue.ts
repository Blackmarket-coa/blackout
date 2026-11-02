// Serialized async write-behind queue for the PostgresBackedDb store.
//
// The store's mutator API is synchronous (it returns immediately after updating
// the in-memory mirror), so Postgres writes are applied asynchronously here.
// A single FIFO promise chain preserves enqueue order — critical so that an
// upsert followed by a delete of the same key never reorders. Failures are
// logged (and retried once) but never thrown into the event loop; durability is
// therefore eventual, bounded by drain() on graceful shutdown.

import { log } from '../telemetry/logger';
import { dbWriteBehindDepth, dbWriteBehindFailuresTotal } from '../telemetry/metrics';
import type { PgClient, PgPool } from './migrate';
import type { StoreChangeTransport } from './pgNotify';
import { resyncMap, snakeToCamel, upsertRecord, type TablePlan } from './pgWriter';

type WriteOp =
    | {
          kind: 'upsert';
          mapName: string;
          record: Record<string, unknown>;
          /** Fields the stored row must still hold for the update to apply (`upsertRecord`). */
          guard?: Record<string, unknown>;
          /** Written only where no row has the record's key (`ON CONFLICT ... DO NOTHING`). */
          insertOnly?: boolean;
      }
    | { kind: 'resync'; mapName: string };

export type MapAccessor = (mapName: string) => Map<string, Record<string, unknown>> | undefined;

/** The row a queued call (`enqueueCall`) can touch: one map's row by key, or any row of the map. */
export type CallScope = { mapName: string; key?: string };

export class WriteBehindQueue {
    private tail: Promise<void> = Promise.resolve();
    private pending = 0;
    /**
     * The last queued operation that can touch each map's rows (keyed by the
     * map name alone: a resync, which writes every row) and each row (keyed
     * by map and key: an upsert, and a scoped call), so a scoped call can be
     * ordered after only the writes that can touch its row and not after
     * the process's writes to other tables (round 11 of part 2's review: the
     * owner's check-in waited behind a backlog of the process's writes to
     * other tables and was answered 503, and that one unanswered statement
     * then refused every owner's check-in on the process).
     */
    private readonly lanes = new Map<string, Promise<unknown>>();
    /** Scoped calls not yet settled, so `drain` waits for them too, and by map, so a resync of the map waits for them. */
    private readonly calls = new Set<Promise<unknown>>();
    private readonly callsByMap = new Map<string, Set<Promise<unknown>>>();

    private static readonly LANE_SEPARATOR = '\u0000';

    private laneOf(mapName: string, key?: string): string {
        return key === undefined ? mapName : `${mapName}${WriteBehindQueue.LANE_SEPARATOR}${key}`;
    }

    /**
     * Every queued operation that can touch the scope's row(s): the map's
     * whole-table lane and, with a key, the row's; without a key (a resync,
     * or a call on the whole map), every scoped call on the map still running.
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

    enqueueUpsert(
        mapName: string,
        record: Record<string, unknown>,
        guard?: Record<string, unknown>,
        insertOnly = false
    ): void {
        this.schedule({
            kind: 'upsert',
            mapName,
            record,
            ...(guard ? { guard } : {}),
            ...(insertOnly ? { insertOnly } : {}),
        });
    }

    enqueueResync(mapName: string): void {
        this.schedule({ kind: 'resync', mapName });
    }

    /**
     * Run `fn` on a connection in the queue's order. Without a scope: after
     * every write queued before it has been attempted, and before any queued
     * after it. With a scope (a map and a row's key): after every write
     * queued before it that can touch that row, this process's upserts of
     * the row and resyncs of the map, and not after its writes to other rows
     * or tables; a write of that row queued while the call runs waits for
     * it, and so does everything queued after that write. Its result is the
     * returned promise's. Unlike a queued write, it is not retried, logged or
     * announced here, and a failure is the caller's (the conditional writes
     * of a switch, `writeDeadmanSwitchIf`).
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
        // After the tail, as every write, and after a scoped call on its row
        // (or, for a resync, on any row of its map) that is still running.
        const keyOf = this.plans.get(op.mapName)?.descriptor.keyOf;
        const scope: CallScope =
            op.kind === 'upsert'
                ? {
                      mapName: op.mapName,
                      // A plan without a key (a test's stub) keys the write by its map alone.
                      key: typeof keyOf === 'function' ? keyOf(op.record) : undefined,
                  }
                : { mapName: op.mapName };
        const run = Promise.allSettled([this.tail, this.before(scope)]).then(() => this.run(op));
        this.tail = run;
        this.occupy(this.laneOf(scope.mapName, scope.key), run);
    }

    private async run(op: WriteOp): Promise<void> {
        const plan = this.plans.get(op.mapName);
        if (!plan) {
            this.pending -= 1;
            return;
        }
        try {
            await this.withRetry(async () => {
                const client = await this.pool.connect();
                try {
                    if (op.kind === 'upsert') {
                        await upsertRecord(client, plan, op.record, op.guard, op.insertOnly);
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
        }
    }

    private async withRetry(fn: () => Promise<void>): Promise<void> {
        try {
            await fn();
        } catch (err) {
            // One retry for transient connection blips; a second failure surfaces to the caller's logger.
            log.warn('db_write_behind_retry', {
                error: err instanceof Error ? err.message : String(err),
            });
            await fn();
        }
    }

    /** Await all queued writes, scoped calls included — call on graceful shutdown. */
    async drain(): Promise<void> {
        await Promise.allSettled([this.tail, ...this.calls]);
    }
}
