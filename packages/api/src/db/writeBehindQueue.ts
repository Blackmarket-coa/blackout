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

import { log } from '../telemetry/logger';
import { dbWriteBehindDepth, dbWriteBehindFailuresTotal } from '../telemetry/metrics';
import type { PgPool } from './migrate';
import type { StoreChangeTransport } from './pgNotify';
import { resyncMap, snakeToCamel, upsertRecord, type TablePlan } from './pgWriter';

type WriteOp = (
    | { kind: 'upsert'; mapName: string; record: Record<string, unknown> }
    | { kind: 'resync'; mapName: string }
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

    enqueueUpsert(mapName: string, record: Record<string, unknown>): void {
        const plan = this.plans.get(mapName);
        const fence = new Map<string, string[]>();
        if (plan) fence.set(mapName, [plan.descriptor.keyOf(record)]);
        this.schedule({ kind: 'upsert', mapName, record, fence });
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

    /** Await all queued writes — call on graceful shutdown. */
    async drain(): Promise<void> {
        await this.tail;
    }
}
