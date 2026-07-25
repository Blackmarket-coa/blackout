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
import type { PgPool } from './migrate';
import type { StoreChangeTransport } from './pgNotify';
import { resyncMap, snakeToCamel, upsertRecord, type TablePlan } from './pgWriter';

type WriteOp =
    | { kind: 'upsert'; mapName: string; record: Record<string, unknown> }
    | { kind: 'resync'; mapName: string };

export type MapAccessor = (mapName: string) => Map<string, Record<string, unknown>> | undefined;

export class WriteBehindQueue {
    private tail: Promise<void> = Promise.resolve();
    private pending = 0;

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

    enqueueUpsert(mapName: string, record: Record<string, unknown>): void {
        this.schedule({ kind: 'upsert', mapName, record });
    }

    enqueueResync(mapName: string): void {
        this.schedule({ kind: 'resync', mapName });
    }

    private schedule(op: WriteOp): void {
        this.pending += 1;
        dbWriteBehindDepth.set(this.pending);
        this.tail = this.tail.then(() => this.run(op));
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
